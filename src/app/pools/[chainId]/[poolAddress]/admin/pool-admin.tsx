"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import {
  Address,
  parseAbi,
  isAddress,
  encodeAbiParameters,
  encodeFunctionData,
} from "viem";
import {
  useConfig,
  useAccount,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Papa from "papaparse";
import { writeContract } from "@wagmi/core";
import { useQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import Card from "react-bootstrap/Card";
import Toast from "react-bootstrap/Toast";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import FormCheck from "react-bootstrap/FormCheck";
import Form from "react-bootstrap/Form";
import InfoTooltip from "@/components/InfoTooltip";
import { getApolloClient } from "@/lib/apollo";
import { gdaAbi } from "@/lib/abi/gda";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";
import { superfluidHostAbi } from "@/lib/abi/superfluidHost";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { isNumber, truncateStr } from "@/lib/utils";

type PoolAdminProps = {
  chainId: number;
  poolAddress: string;
};

type MemberEntry = { address: string; units: string; validationError: string };

const SUPERFLUID_QUERY = gql`
  query SuperfluidQuery($token: String!, $gdaPool: String!) {
    token(id: $token) {
      id
      symbol
    }
    pool(id: $gdaPool) {
      id
      poolMembers {
        account {
          id
        }
        units
      }
      poolDistributors(first: 1000, where: { flowRate_not: "0" }) {
        account {
          id
        }
        flowRate
      }
    }
  }
`;

export default function PoolAdmin(props: PoolAdminProps) {
  const { poolAddress, chainId } = props;

  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    { address: "", units: "", validationError: "" },
  ]);
  const [membersToRemove, setMembersToRemove] = useState<MemberEntry[]>([]);
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { isMobile } = useMediaQuery();
  const { data: walletClient } = useWalletClient();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const { data: poolAdmin } = useReadContract({
    address: poolAddress as Address,
    abi: superfluidPoolAbi,
    functionName: "admin",
    chainId,
  });

  const { data: superToken, isLoading: superTokenLoading } = useReadContract({
    address: poolAddress as Address,
    abi: superfluidPoolAbi,
    functionName: "superToken",
    chainId,
  });

  const tokenAddress = superToken
    ? (superToken as Address).toLowerCase()
    : undefined;

  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SUPERFLUID_QUERY, {
      client: getApolloClient("superfluid", chainId),
      variables: {
        token: tokenAddress,
        gdaPool: poolAddress.toLowerCase(),
      },
      pollInterval: 10000,
      skip: !tokenAddress,
    });

  const { data: unitsTrasnferability } = useReadContract({
    address: poolAddress as Address,
    abi: parseAbi([
      "function transferabilityForUnitsOwner() view returns (bool)",
    ]),
    functionName: "transferabilityForUnitsOwner",
    chainId,
    query: { enabled: !!tokenAddress },
  });

  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();
  const postHog = usePostHog();

  const network = networks.find((network) => network.id === chainId);
  const poolToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === tokenAddress,
  );
  const isAdmin =
    address?.toLowerCase() === (poolAdmin as Address)?.toLowerCase();
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.validationError === "" &&
      memberEntry.address !== "" &&
      memberEntry.units !== "",
  );

  const totalUnits = useMemo(
    () =>
      membersEntry
        .map((memberEntry) =>
          isNumber(memberEntry.units) ? Number(memberEntry.units) : 0,
        )
        .reduce((a, b) => a + b, 0),
    [membersEntry],
  );

  const hasChanges = useMemo(() => {
    const compareArrays = (a: string[], b: string[]) =>
      a.length === b.length && a.every((elem, i) => elem === b[i]);

    const sortedPoolMembers = superfluidQueryRes?.pool?.poolMembers
      ? [...superfluidQueryRes.pool.poolMembers].sort(
          (a: { account: { id: string } }, b: { account: { id: string } }) =>
            a.account.id > b.account.id ? -1 : 1,
        )
      : [];
    const sortedMembersEntry = membersEntry
      ? [...membersEntry].sort((a, b) =>
          a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
        )
      : [];
    const hasChangesMembers =
      sortedPoolMembers &&
      (!compareArrays(
        sortedPoolMembers
          .filter((member: { units: string }) => member.units !== "0")
          .map((member: { account: { id: string } }) => member.account.id),
        sortedMembersEntry.map((member) => member.address.toLowerCase()),
      ) ||
        !compareArrays(
          sortedPoolMembers
            .filter((member: { units: string }) => member.units !== "0")
            .map((member: { units: string }) => member.units),
          sortedMembersEntry.map((member) => member.units),
        ));

    return hasChangesMembers || membersToRemove.length > 0;
  }, [superfluidQueryRes, membersEntry, membersToRemove]);

  const addPoolToWallet = useCallback(() => {
    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: poolAddress,
          symbol: superfluidQueryRes?.pool?.token?.symbol ?? "POOL",
          decimals: 0,
          image: "",
        },
      },
    });
  }, [poolAddress, superfluidQueryRes, walletClient]);

  useEffect(() => {
    (async () => {
      if (!superfluidQueryRes?.pool?.poolMembers) {
        return;
      }

      const membersEntry = superfluidQueryRes.pool.poolMembers
        .filter((member: { units: string }) => member.units !== "0")
        .map((member: { account: { id: string }; units: string }) => {
          return {
            address: member.account.id,
            units: member.units,
            validationError: "",
          };
        });

      if (membersEntry.length > 0) {
        setMembersEntry(membersEntry);
      }
    })();
  }, [superfluidQueryRes]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const removeMemberEntry = (memberEntry: MemberEntry, memberIndex: number) => {
    setMembersEntry((prev) =>
      prev.filter(
        (_, prevMemberEntryIndex) => prevMemberEntryIndex !== memberIndex,
      ),
    );

    const existingPoolMember = superfluidQueryRes?.pool?.poolMembers?.find(
      (member: { account: { id: string } }) =>
        member.account.id === memberEntry.address.toLowerCase(),
    );

    if (
      !memberEntry.validationError &&
      existingPoolMember &&
      existingPoolMember.units !== "0"
    ) {
      setMembersToRemove(membersToRemove.concat(memberEntry));
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) {
      return;
    }

    Papa?.parse(e.target.files[0], {
      complete: (results: { data: string[] }) => {
        const { data } = results;

        const membersEntry: MemberEntry[] = [];

        for (const row of data) {
          if (!row[0]) {
            continue;
          }

          membersEntry.push({
            address: row[0],
            units:
              isNumber(row[1]) && !row[1].includes(".")
                ? row[1].replace(/\s/g, "")
                : "",
            validationError: !isAddress(row[0])
              ? "Invalid Address"
              : membersEntry
                    .map((memberEntry) => memberEntry.address.toLowerCase())
                    .includes(row[0].toLowerCase())
                ? "Address already added"
                : "",
          });
        }

        const membersToRemove = [];

        for (const i in membersEntry) {
          if (membersEntry[i].units === "0") {
            if (!membersEntry[i].validationError) {
              membersToRemove.push(membersEntry[i]);
              membersEntry.splice(Number(i), 1);
            }
          }
        }

        const csvAddresses = data.map((row) => row[0].toLowerCase());
        const existingMembers = superfluidQueryRes?.pool.poolMembers;
        const excludedMembers = existingMembers.filter(
          (existingMember: { account: { id: string } }) =>
            !csvAddresses.some(
              (address) => existingMember.account.id === address,
            ),
        );

        for (const excludedMember of excludedMembers) {
          membersToRemove.push({
            address: excludedMember.account.id,
            units: excludedMember.units,
            validationError: "",
          });
        }

        setMembersEntry(membersEntry);
        setMembersToRemove(membersToRemove);
      },
    });
  };

  const handleSubmit = async () => {
    if (!network || !address || !publicClient) {
      return;
    }

    try {
      setTransactionSuccess("");
      setTransactionError("");
      setIsTransactionLoading(true);

      const validMembers = membersEntry.filter(
        (memberEntry) =>
          memberEntry.validationError === "" &&
          memberEntry.address !== "" &&
          !superfluidQueryRes?.pool?.poolMembers.some(
            (member: { account: { id: string }; units: string }) =>
              member.account.id === memberEntry.address &&
              member.units === memberEntry.units,
          ),
      );

      const changedMembers = validMembers
        .map((member) => ({
          address: member.address as Address,
          units: BigInt(member.units),
        }))
        .concat(
          membersToRemove.map((member) => ({
            address: member.address as Address,
            units: BigInt(0),
          })),
        );

      const operations = changedMembers.map((member) => ({
        operationType: 201,
        target: network.gda,
        data: encodeAbiParameters(
          [{ type: "bytes" }, { type: "bytes" }],
          [
            encodeFunctionData({
              abi: gdaAbi,
              functionName: "updateMemberUnits",
              args: [
                poolAddress as Address,
                member.address,
                member.units,
                "0x" as `0x${string}`,
              ],
            }),
            "0x" as `0x${string}`,
          ],
        ),
      }));

      const hash = await writeContract(wagmiConfig, {
        address: network.superfluidHost,
        abi: superfluidHostAbi,
        functionName: "batchCall",
        args: [operations],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      });

      setIsTransactionLoading(false);
      setTransactionSuccess("Pool Updated Successfully");
      setMembersToRemove([]);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        {superTokenLoading || superfluidQueryLoading ? (
          <span className="position-absolute top-50 start-50 translate-middle">
            <Spinner />
          </span>
        ) : !network ? (
          <p className="w-100 mt-5 fs-4 text-center">Network Not Found</p>
        ) : (
          <>
            <h1 className="d-flex flex-column flex-sm-row align-items-sm-center overflow-hidden gap-sm-1 fs-3">
              <span className="text-truncate">
                Distribution Pool{" "}
                <span className="d-none d-sm-inline-block">(</span>
              </span>
              <Stack direction="horizontal" gap={1}>
                <Link
                  href={`${network.superfluidExplorer}/pools/${poolAddress}`}
                  target="_blank"
                >
                  {truncateStr(poolAddress, 14)}
                </Link>
                <span className="d-none d-sm-inline-block">)</span>
                <Button
                  variant="transparent"
                  className="d-flex align-items-center mt-2 p-0 border-0"
                  onClick={() =>
                    !address && openConnectModal
                      ? openConnectModal()
                      : connectedChain?.id !== chainId
                        ? switchChain({ chainId })
                        : addPoolToWallet()
                  }
                >
                  <InfoTooltip
                    position={{ top: true }}
                    target={<Image width={48} src="/wallet.svg" alt="wallet" />}
                    content={<p className="m-0 p-2">Add to Wallet</p>}
                  />
                </Button>
              </Stack>
            </h1>
            <Stack direction="horizontal" gap={1} className="fs-lg">
              Distributing{" "}
              {poolToken && (
                <Image src={poolToken.icon} alt="" width={18} height={18} />
              )}
              {superfluidQueryRes?.token.symbol} on
              <Image src={network.icon} alt="" width={18} height={18} />
              {network.name}
            </Stack>
            <Card className="bg-lace-100 rounded-4 border-0 mt-10 px-10 py-8">
              <Card.Body className="p-0">
                <Card.Text className="text-info">
                  Configuration in this section cannot be edited after
                  deployment.
                </Card.Text>
                <Dropdown>
                  <Dropdown.Toggle
                    className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                    style={{ width: 156, paddingTop: 12, paddingBottom: 12 }}
                    disabled
                  >
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="align-items-center"
                    >
                      <Image
                        src={network.icon}
                        alt="Network Icon"
                        width={18}
                        height={18}
                      />
                      {network.name}
                    </Stack>
                  </Dropdown.Toggle>
                </Dropdown>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={isMobile ? 1 : 3}
                  className="align-items-start mt-2"
                >
                  <Dropdown>
                    <Dropdown.Toggle
                      className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                      disabled
                      style={{
                        width: 156,
                        paddingTop: 12,
                        paddingBottom: 12,
                      }}
                    >
                      <Stack
                        direction="horizontal"
                        gap={1}
                        className="align-items-center"
                      >
                        {poolToken && (
                          <Image
                            src={poolToken.icon}
                            alt="Network Icon"
                            width={18}
                            height={18}
                          />
                        )}
                        {superfluidQueryRes?.token.symbol}
                      </Stack>
                    </Dropdown.Toggle>
                  </Dropdown>
                  <Stack direction="vertical" className="align-self-sm-end">
                    <Form.Control
                      type="text"
                      disabled
                      value={superfluidQueryRes?.token.id}
                      className="bg-white border-0 fw-semi-bold"
                      style={{
                        width: !isMobile ? "50%" : "",
                        paddingTop: 10,
                        paddingBottom: 10,
                      }}
                    />
                  </Stack>
                </Stack>
                <Stack direction="vertical" className="mt-6">
                  <Form.Label className="d-flex gap-1 mb-3 fs-6 text-secondary fw-semi-bold">
                    Share Transferability
                    <InfoTooltip
                      position={{ top: true }}
                      target={
                        <Image
                          src="/info.svg"
                          alt="Info"
                          width={14}
                          height={14}
                          className="align-top"
                        />
                      }
                      content={
                        <p className="m-0 p-2">
                          Should recipients be able to transfer (or trade) their
                          shares?
                        </p>
                      }
                    />
                  </Form.Label>
                  <Stack direction="horizontal" gap={5}>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        disabled
                        checked={!unitsTrasnferability}
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Non-Transferable (Admin Only)
                      </FormCheck.Label>
                    </FormCheck>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        disabled
                        checked={!!unitsTrasnferability}
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Transferable by Recipients
                      </FormCheck.Label>
                    </FormCheck>
                  </Stack>
                </Stack>
              </Card.Body>
            </Card>
            <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
                Pool Admin
                <InfoTooltip
                  position={{ top: true }}
                  target={
                    <Image
                      src="/info.svg"
                      alt="Info"
                      width={14}
                      height={14}
                      className="align-top"
                    />
                  }
                  content={
                    <p className="m-0 p-2">
                      Distribution pool admins are fixed at deployment.
                    </p>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0">
                <Form.Control
                  type="text"
                  disabled
                  value={(poolAdmin as Address) ?? ""}
                  className="bg-white border-0 fw-semi-bold"
                  style={{
                    width: !isMobile ? "50%" : "",
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                />
              </Card.Body>
            </Card>
            <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
                Share Register (POOL)
                <InfoTooltip
                  position={{ top: true }}
                  target={
                    <Image
                      src="/info.svg"
                      alt="Info"
                      width={18}
                      height={18}
                      className="align-top"
                    />
                  }
                  content={
                    <p className="m-0 p-2">
                      As tokens are streamed to the pool, they're proportionally
                      distributed in real time to recipients according to their
                      percentage of the total outstanding shares.
                      <br />
                      <br />
                      Any changes to the total number of outstanding or a
                      recipient's shares will be reflected in the continuing
                      stream allocation.
                    </p>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0">
                {membersEntry.map((memberEntry, i) => (
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 2 : 4}
                    className="justify-content-start mb-3"
                    key={i}
                  >
                    <Stack direction="vertical" className="w-100">
                      <Stack direction="vertical" className="position-relative">
                        <Form.Control
                          type="text"
                          disabled={
                            !isAdmin ||
                            (superfluidQueryRes?.pool?.poolMembers
                              .map((member: { account: { id: string } }) =>
                                member.account.id.toLowerCase(),
                              )
                              .includes(memberEntry.address.toLowerCase()) &&
                              !memberEntry.validationError)
                          }
                          placeholder={
                            isMobile ? "Address" : "Recipient Address"
                          }
                          value={memberEntry.address}
                          className="bg-white border-0 fw-semi-bold"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                          onChange={(e) => {
                            const prevMembersEntry = [...membersEntry];
                            const value = e.target.value;

                            if (!isAddress(value)) {
                              prevMembersEntry[i].validationError =
                                "Invalid Address";
                            } else if (
                              prevMembersEntry
                                .map((prevMember) =>
                                  prevMember.address.toLowerCase(),
                                )
                                .includes(value.toLowerCase())
                            ) {
                              prevMembersEntry[i].validationError =
                                "Address already added";
                            } else {
                              prevMembersEntry[i].validationError = "";
                            }

                            prevMembersEntry[i].address = value;

                            setMembersEntry(prevMembersEntry);
                          }}
                        />
                        {memberEntry.validationError ? (
                          <Card.Text
                            className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger"
                            style={{ bottom: 1, fontSize: "0.7rem" }}
                          >
                            {memberEntry.validationError}
                          </Card.Text>
                        ) : null}
                      </Stack>
                    </Stack>
                    <Stack direction="vertical">
                      <Form.Control
                        type="text"
                        inputMode="numeric"
                        placeholder="Shares"
                        disabled={!isAdmin}
                        value={memberEntry.units}
                        className="bg-white border-0 fw-semi-bold text-center"
                        style={{ paddingTop: 12, paddingBottom: 12 }}
                        onChange={(e) => {
                          const prevMembersEntry = [...membersEntry];
                          const value = e.target.value;

                          if (!value) {
                            prevMembersEntry[i].units = "";
                          } else if (value.includes(".")) {
                            return;
                          } else if (isNumber(value)) {
                            if (value === "0") {
                              removeMemberEntry(prevMembersEntry[i], i);

                              return;
                            } else {
                              prevMembersEntry[i].units = value;
                            }
                          }

                          setMembersEntry(prevMembersEntry);
                        }}
                      />
                    </Stack>
                    <Stack direction="vertical">
                      <Stack
                        direction="horizontal"
                        gap={isMobile ? 1 : 2}
                        className="align-items-center"
                      >
                        <Form.Control
                          type="text"
                          placeholder="%"
                          disabled
                          value={
                            !memberEntry.units ||
                            Number(memberEntry.units) === 0
                              ? ""
                              : `${parseFloat(
                                  (
                                    (Number(memberEntry.units) /
                                      membersEntry
                                        .map((memberEntry) =>
                                          isNumber(memberEntry.units)
                                            ? Number(memberEntry.units)
                                            : 0,
                                        )
                                        .reduce((a, b) => a + b, 0)) *
                                    100
                                  ).toFixed(isMobile ? 1 : 2),
                                )}%`
                          }
                          className="bg-white border-0 fw-semi-bold text-center"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                        <Button
                          variant="transparent"
                          disabled={!isAdmin}
                          className="p-0 border-0"
                          onClick={() => removeMemberEntry(memberEntry, i)}
                        >
                          <Image
                            src="/close.svg"
                            alt="Remove"
                            width={28}
                            height={28}
                          />
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                ))}
                {membersToRemove.map((memberEntry, i) => (
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 2 : 4}
                    className="justify-content-start mb-3"
                    key={i}
                  >
                    <Stack direction="vertical" className="w-100">
                      <Stack direction="vertical" className="position-relative">
                        <Form.Control
                          disabled
                          type="text"
                          value={memberEntry.address}
                          className="bg-white border-0 fw-semi-bold"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                      </Stack>
                    </Stack>
                    <Stack direction="vertical">
                      <Form.Control
                        type="text"
                        disabled
                        inputMode="numeric"
                        value="0"
                        className="bg-white border-0 fw-semi-bold text-center"
                        style={{ paddingTop: 12, paddingBottom: 12 }}
                      />
                    </Stack>
                    <Stack direction="vertical">
                      <Stack
                        direction="horizontal"
                        gap={isMobile ? 1 : 2}
                        className="align-items-center"
                      >
                        <Form.Control
                          type="text"
                          disabled
                          value="Removed"
                          className="bg-white border-0 fw-semi-bold text-center"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                        <Button
                          variant="transparent"
                          disabled={!isAdmin}
                          className="p-0"
                          onClick={() => {
                            setMembersToRemove((prev) =>
                              prev.filter(
                                (_, prevMemberEntryIndex) =>
                                  prevMemberEntryIndex !== i,
                              ),
                            );
                            setMembersEntry(membersEntry.concat(memberEntry));
                          }}
                        >
                          <Image
                            src="/add-circle.svg"
                            alt="Add"
                            width={28}
                            height={28}
                          />
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                ))}
                <Stack direction="horizontal" gap={isMobile ? 2 : 4}>
                  <Button
                    variant="transparent"
                    disabled={!isAdmin}
                    className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline border-0"
                    onClick={() =>
                      setMembersEntry((prev) =>
                        prev.concat({
                          address: "",
                          units: "",
                          validationError: "",
                        }),
                      )
                    }
                  >
                    <Card.Text className="mb-0 ms-2 ps-1 fw-semi-bold">
                      {isMobile ? "Add recipient" : "Add another recipient"}
                    </Card.Text>
                  </Button>
                  <Stack>
                    <Form.Control
                      type="text"
                      disabled
                      className="bg-transparent text-info text-center border-0 fw-semi-bold"
                      value={totalUnits}
                    />
                  </Stack>
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 1 : 2}
                    className="align-items-center"
                  >
                    <Form.Control
                      type="text"
                      disabled
                      value="100%"
                      className="bg-transparent border-0 text-center fw-semi-bold"
                    />
                    <span className="p-0 opacity-0">
                      <Image
                        src="/close.svg"
                        alt="Remove"
                        width={28}
                        height={28}
                      />
                    </span>
                  </Stack>
                </Stack>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={2}
                  className="justify-content-end mt-6"
                >
                  <Card.Link
                    href={URL.createObjectURL(
                      new Blob([
                        Papa.unparse(
                          membersEntry.map((memberEntry) => {
                            return [memberEntry.address, memberEntry.units];
                          }),
                        ),
                      ]),
                    )}
                    target="_blank"
                    download="Pool_Members.csv"
                    className="m-0 bg-secondary px-10 py-4 rounded-4 text-light fw-semi-bold text-decoration-none"
                  >
                    Export Current
                  </Card.Link>
                  <>
                    <Form.Label
                      htmlFor="upload-csv"
                      className={`text-white fw-semi-bold text-center m-0 px-10 py-4 rounded-4 ${isAdmin ? "bg-primary cursor-pointer" : "bg-info opacity-75"}`}
                    >
                      Upload CSV
                    </Form.Label>
                    <Form.Control
                      type="file"
                      id="upload-csv"
                      accept=".csv"
                      hidden
                      disabled={!isAdmin}
                      onChange={handleCsvUpload}
                    />
                  </>
                </Stack>
                <Card.Link
                  href="https://docs.google.com/spreadsheets/d/13oBKSJzKfW0yC8ghiZ_3EYWrjlZ9g8BU-mV91ezG_XU/edit?gid=0#gid=0"
                  target="_blank"
                  className="float-end mt-2 pe-1 text-primary fw-semi-bold"
                >
                  Template
                </Card.Link>
              </Card.Body>
            </Card>
            <Stack direction="vertical" className="mt-8">
              <Button
                disabled={!hasChanges || !isValidMembersEntry}
                className="w-100 py-4 rounded-4 fs-6 fw-semi-bold"
                onClick={() =>
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== chainId
                      ? switchChain({ chainId })
                      : handleSubmit()
                }
              >
                {isTransactionLoading ? (
                  <Spinner size="sm" className="ms-2" />
                ) : (
                  "Update Pool"
                )}
              </Button>
            </Stack>
            <Toast
              show={!!transactionSuccess}
              autohide
              delay={5000}
              onClose={() => setTransactionSuccess("")}
              className="w-100 p-4 mt-4 fs-6 fw-semi-bold"
              style={{
                background: "rgb(209, 231, 220.8)",
                color: "rgb(10, 54, 33.6)",
                borderColor: "rgb(163, 207, 186.6)",
              }}
            >
              Pool Updated Successfully!
            </Toast>
            {transactionError ? (
              <Alert variant="danger" className="w-100 mt-4 p-4 fw-semi-bold">
                {transactionError}
              </Alert>
            ) : null}
          </>
        )}
      </Stack>
    </>
  );
}
