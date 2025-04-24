"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { Address, parseAbi, isAddress } from "viem";
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
import Container from "react-bootstrap/Container";
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
import OpenFlow from "@/app/flow-splitters/components/OpenFlow";
import InstantDistribution from "@/app/flow-splitters/components/InstantDistribution";
import { getApolloClient } from "@/lib/apollo";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { isNumber, truncateStr } from "@/lib/utils";

type AdminProps = {
  chainId: number;
  poolId: string;
};

type PoolConfig = {
  transferableUnits: boolean;
  immutable: boolean;
};

type AdminEntry = { address: string; validationError: string };
type MemberEntry = { address: string; units: string; validationError: string };

const FLOW_SPLITTER_POOL_QUERY = gql`
  query FlowSplitterPoolQuery($poolId: String!) {
    pools(where: { id: $poolId }) {
      poolAddress
      name
      symbol
      token
      poolAdmins {
        address
      }
    }
  }
`;

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

export default function Admin(props: AdminProps) {
  const { poolId, chainId } = props;

  const [poolConfig, setPoolConfig] = useState<PoolConfig>({
    transferableUnits: false,
    immutable: false,
  });
  const [adminsEntry, setAdminsEntry] = useState<AdminEntry[]>([
    { address: "", validationError: "" },
  ]);
  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    { address: "", units: "", validationError: "" },
  ]);
  const [membersToRemove, setMembersToRemove] = useState<MemberEntry[]>([]);
  const [showCoreConfig, setShowCoreConfig] = useState(false);
  const [showOpenFlow, setShowOpenFlow] = useState(false);
  const [showInstantDistribution, setShowInstantDistribution] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();
  const { data: walletClient } = useWalletClient();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const {
    data: flowSplitterPoolQueryRes,
    loading: flowSplitterPoolQueryLoading,
  } = useQuery(FLOW_SPLITTER_POOL_QUERY, {
    client: getApolloClient("flowSplitter", chainId),
    variables: {
      poolId: `0x${Number(poolId).toString(16)}`,
      address: address?.toLowerCase() ?? "",
    },
    pollInterval: 10000,
  });
  const poolAdmins = flowSplitterPoolQueryRes?.pools[0]?.poolAdmins;
  const pool = flowSplitterPoolQueryRes?.pools[0];
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SUPERFLUID_QUERY, {
      client: getApolloClient("superfluid", chainId),
      variables: { token: pool?.token, gdaPool: pool?.poolAddress },
      pollInterval: 10000,
      skip: !pool,
    });
  const { data: unitsTrasnferability } = useReadContract({
    address: pool?.poolAddress,
    abi: parseAbi([
      "function transferabilityForUnitsOwner() view returns (bool)",
    ]),
    functionName: "transferabilityForUnitsOwner",
    query: { enabled: !!pool },
  });
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();
  const postHog = usePostHog();

  const network = networks.find((network) => network.id === chainId);
  const poolToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === pool?.token,
  );
  const isValidAdminsEntry = adminsEntry.every(
    (adminEntry) =>
      adminEntry.validationError === "" && adminEntry.address !== "",
  );
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

    const sortedPoolAdmins = poolAdmins
      ?.toSorted((a: { address: string }, b: { address: string }) =>
        a.address > b.address ? -1 : 1,
      )
      .map((admin: { address: string }) => admin.address);
    const sortedAdminsEntry = adminsEntry
      .toSorted((a, b) =>
        a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
      )
      .map((admin) => admin.address.toLowerCase());
    const hasChangesAdmins =
      poolConfig.immutable ||
      (sortedPoolAdmins && !compareArrays(sortedPoolAdmins, sortedAdminsEntry));
    const sortedPoolMembers = superfluidQueryRes?.pool?.poolMembers?.toSorted(
      (a: { account: { id: string } }, b: { account: { id: string } }) =>
        a.account.id > b.account.id ? -1 : 1,
    );
    const sortedMembersEntry = membersEntry.toSorted((a, b) =>
      a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
    );
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

    return hasChangesAdmins || hasChangesMembers ? true : false;
  }, [poolConfig, poolAdmins, adminsEntry, superfluidQueryRes, membersEntry]);

  const addPoolToWallet = useCallback(() => {
    if (!pool) {
      return;
    }

    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: pool.poolAddress,
          symbol: pool.symbol,
          decimals: 0,
          image: "",
        },
      },
    });
  }, [pool, walletClient]);

  useEffect(() => {
    (async () => {
      if (flowSplitterPoolQueryLoading) {
        return;
      }

      if (poolAdmins) {
        setAdminsEntry(
          poolAdmins.map((poolAdmin: { address: string }) => {
            return { address: poolAdmin.address, validationError: "" };
          }),
        );
      }
    })();
  }, [flowSplitterPoolQueryLoading, pool, poolAdmins]);

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

      const validAdmins = adminsEntry.filter(
        (adminEntry) =>
          adminEntry.validationError === "" && adminEntry.address !== "",
      );
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

      const adminsToRemove = poolAdmins
        .map((admin: { address: string }) => admin.address)
        .filter(
          (x: string) =>
            !validAdmins
              .map((admin: { address: string }) => admin.address)
              .includes(x),
        );

      const hash = await writeContract(wagmiConfig, {
        address: network.flowSplitter,
        abi: flowSplitterAbi,
        functionName: "updatePool",
        args: [
          BigInt(poolId),
          validMembers
            .map((member) => {
              return {
                account: member.address as Address,
                units: BigInt(member.units),
              };
            })
            .concat(
              membersToRemove.map((member) => {
                return { account: member.address as Address, units: BigInt(0) };
              }),
            ),
          poolConfig.immutable
            ? poolAdmins.map((admin: { address: Address }) => {
                return { account: admin.address, status: BigInt(1) };
              })
            : validAdmins
                .map((admin) => {
                  return {
                    account: admin.address as Address,
                    status: BigInt(0),
                  };
                })
                .concat(
                  adminsToRemove.map((adminAddress: string) => {
                    return { account: adminAddress, status: BigInt(1) };
                  }),
                ),
          "",
        ],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      });

      setIsTransactionLoading(false);
      setTransactionSuccess("Flow Splitter Updated Successfully");
      setMembersToRemove([]);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  return (
    <>
      <Container
        className="mx-auto p-0 px-4 mb-5"
        style={{
          maxWidth:
            isMobile || isTablet
              ? "100%"
              : isSmallScreen
                ? 1000
                : isMediumScreen
                  ? 1300
                  : 1600,
        }}
      >
        {flowSplitterPoolQueryLoading || superfluidQueryLoading ? (
          <span className="position-absolute top-50 start-50 translate-middle">
            <Spinner />
          </span>
        ) : !poolAdmins?.find(
            (poolAdmin: { address: string }) =>
              poolAdmin.address === address?.toLowerCase(),
          ) || !network ? (
          <p className="w-100 mt-5 fs-4 text-center">Pool Admin Not Found</p>
        ) : (
          <>
            <h1 className="d-flex flex-column flex-sm-row align-items-sm-center overflow-hidden gap-sm-1 mt-5 mb-1">
              <span className="text-truncate">
                Edit{" "}
                {pool && pool.name !== "Superfluid Pool"
                  ? pool.name
                  : "Flow Splitter"}{" "}
                <span className="d-none d-sm-inline-block">(</span>
              </span>
              <Stack direction="horizontal" gap={1}>
                <Link
                  href={`${network.superfluidExplorer}/pools/${pool.poolAddress}`}
                  target="_blank"
                >
                  {truncateStr(pool.poolAddress, 14)}
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
                    target={<Image width={32} src="/wallet.svg" alt="wallet" />}
                    content={<>Add to Wallet</>}
                  />
                </Button>
              </Stack>
            </h1>
            <Stack direction="horizontal" gap={1} className="fs-6">
              Distributing{" "}
              {poolToken && (
                <Image src={poolToken.icon} alt="" width={18} height={18} />
              )}
              {superfluidQueryRes?.token.symbol} on
              <Image src={network.icon} alt="" width={18} height={18} />
              {network.name}
            </Stack>
            <Button
              className="w-100 mt-5 py-2 fs-4"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== chainId
                    ? switchChain({ chainId })
                    : setShowOpenFlow(true);
              }}
            >
              Open Flow
            </Button>
            <Button
              variant="secondary"
              className="w-100 mt-3 py-2 fs-4"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== chainId
                    ? switchChain({ chainId })
                    : setShowInstantDistribution(true);
              }}
            >
              Send Distribution
            </Button>
            <Card className="bg-light rounded-4 border-0 mt-4 px-3 px-sm-4 py-4">
              <Card.Header
                className="d-flex justify-content-between align-items-center bg-transparent border-0 rounded-4 p-0 fs-4 cursor-pointer"
                onClick={() => setShowCoreConfig(!showCoreConfig)}
              >
                Core Configuration{" "}
                <Image
                  src={showCoreConfig ? "/expand-less.svg" : "/expand-more.svg"}
                  alt=""
                  width={42}
                  height={42}
                />
              </Card.Header>
              {showCoreConfig && (
                <Card.Body className="p-0">
                  <Card.Text className="text-info">
                    Configuration in this section cannot be edited after
                    deployment.
                  </Card.Text>
                  <Dropdown>
                    <Dropdown.Toggle
                      className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
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
                        className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
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
                        style={{
                          width: !isMobile ? "50%" : "",
                          paddingTop: 12,
                          paddingBottom: 12,
                        }}
                      />
                    </Stack>
                  </Stack>
                  <Stack direction="vertical" className="mt-4">
                    <Form.Label className="d-flex gap-1 mb-2 fs-5">
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
                          <>
                            Should recipients be able to transfer (or trade)
                            their shares?
                            <br />
                            <br />
                            Carefully consider the implications with your
                            Contract Admin selection below and your particular
                            use case before choosing to enable transferability.
                            This is not editable after launch.
                          </>
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
                        <FormCheck.Label>
                          Non-Transferable (Admin Only)
                        </FormCheck.Label>
                      </FormCheck>
                      <FormCheck type="radio">
                        <FormCheck.Input
                          type="radio"
                          disabled
                          checked={!!unitsTrasnferability}
                        />
                        <FormCheck.Label>
                          Transferable by Recipients
                        </FormCheck.Label>
                      </FormCheck>
                    </Stack>
                  </Stack>
                </Card.Body>
              )}
            </Card>
            <Card className="bg-light rounded-4 border-0 mt-4 px-3 px-sm-4 py-4">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-4">
                Contract Admin
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
                    <>
                      Set the address(es), including multisigs, that should be
                      able to update the shares of your Flow Splitter for your
                      use case.
                      <br />
                      <br />
                      Admins can relinquish, transfer, or add others to the
                      admin role. If there are no admins, your Flow Splitter
                      contract is immutable.
                    </>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0">
                <Form.Group>
                  <Stack direction="horizontal" gap={5}>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        checked={!poolConfig.immutable}
                        onChange={() =>
                          setPoolConfig({
                            ...poolConfig,
                            immutable: false,
                          })
                        }
                      />
                      <FormCheck.Label>Admin</FormCheck.Label>
                    </FormCheck>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        checked={!!poolConfig.immutable}
                        onChange={() =>
                          setPoolConfig({
                            ...poolConfig,
                            immutable: true,
                          })
                        }
                      />
                      <FormCheck.Label>No Admin</FormCheck.Label>
                    </FormCheck>
                  </Stack>
                  {!poolConfig.immutable && (
                    <div className="mt-2">
                      {adminsEntry.map((adminEntry, i) => (
                        <Stack
                          direction="vertical"
                          className="position-relative mb-3"
                          key={i}
                        >
                          <Stack
                            direction="horizontal"
                            gap={2}
                            className="align-items-center"
                          >
                            <Form.Control
                              key={i}
                              type="text"
                              value={adminEntry.address}
                              style={{
                                width: !isMobile ? "50%" : "",
                                paddingTop: 12,
                                paddingBottom: 12,
                              }}
                              onChange={(e) => {
                                const prevAdminsEntry = [...adminsEntry];
                                const value = e.target.value;

                                if (!isAddress(value)) {
                                  prevAdminsEntry[i].validationError =
                                    "Invalid Address";
                                } else if (
                                  prevAdminsEntry
                                    .map((prevAdmin) =>
                                      prevAdmin.address.toLowerCase(),
                                    )
                                    .includes(value.toLowerCase())
                                ) {
                                  prevAdminsEntry[i].validationError =
                                    "Address already added";
                                } else {
                                  prevAdminsEntry[i].validationError = "";
                                }

                                prevAdminsEntry[i].address = value;

                                setAdminsEntry(prevAdminsEntry);
                              }}
                            />
                            <Button
                              variant="transparent"
                              className="p-0"
                              onClick={() => {
                                setAdminsEntry((prev) =>
                                  prev.filter(
                                    (_, prevAdminEntryIndex) =>
                                      prevAdminEntryIndex !== i,
                                  ),
                                );
                              }}
                            >
                              <Image
                                src="/close.svg"
                                alt="Remove"
                                width={28}
                                height={28}
                              />
                            </Button>
                          </Stack>
                          {adminEntry.validationError ? (
                            <Card.Text
                              className="position-absolute mb-0 ms-2 ps-1 text-danger"
                              style={{ bottom: 1, fontSize: "0.7rem" }}
                            >
                              {adminEntry.validationError}
                            </Card.Text>
                          ) : null}
                        </Stack>
                      ))}
                      <Button
                        variant="transparent"
                        className="p-0 text-primary text-decoration-underline"
                        onClick={() =>
                          setAdminsEntry((prev) =>
                            prev.concat({
                              address: "",
                              validationError: "",
                            }),
                          )
                        }
                      >
                        <Card.Text className="mb-0 ms-sm-2 ps-sm-1">
                          Add another admin
                        </Card.Text>
                      </Button>
                    </div>
                  )}
                </Form.Group>
              </Card.Body>
            </Card>
            <Card className="bg-light rounded-4 border-0 mt-4 px-3 px-sm-4 py-4">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-4">
                Share Register ({pool?.symbol ? pool.symbol : "POOL"})
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
                    <>
                      As tokens are streamed to the Flow Splitter, they're
                      proportionally distributed in real time to recipients
                      according to their percentage of the total outstanding
                      shares.
                      <br />
                      <br />
                      Any changes to the total number of outstanding or a
                      recipient's shares will be reflected in the continuing
                      stream allocation.
                    </>
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
                            superfluidQueryRes?.pool?.poolMembers
                              .map((member: { account: { id: string } }) =>
                                member.account.id.toLowerCase(),
                              )
                              .includes(memberEntry.address.toLowerCase()) &&
                            !memberEntry.validationError
                          }
                          placeholder={
                            isMobile ? "Address" : "Recipient Address"
                          }
                          value={memberEntry.address}
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
                        value={memberEntry.units}
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
                        className="text-center"
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
                          className="text-center"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                        <Button
                          variant="transparent"
                          className="p-0"
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
                        className="text-center"
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
                          className="text-center"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                        <Button
                          variant="transparent"
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
                    className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline"
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
                    <Card.Text className="mb-0 ms-2 ps-1">
                      {isMobile ? "Add recipient" : "Add another recipient"}
                    </Card.Text>
                  </Button>
                  <Stack>
                    <Form.Control
                      type="text"
                      disabled
                      className="bg-transparent text-info text-center border-0"
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
                      className="bg-transparent border-0 text-center"
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
                  className="justify-content-end mt-3"
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
                    download="Flow_Splitter.csv"
                    className="m-0 bg-secondary px-5 py-2 rounded-3 text-light text-center text-decoration-none"
                  >
                    Export Current
                  </Card.Link>
                  <Form.Label
                    htmlFor="upload-csv"
                    className="bg-primary text-white text-center m-0 px-5 py-2 rounded-3 cursor-pointer"
                  >
                    Upload CSV
                  </Form.Label>
                  <Form.Control
                    type="file"
                    id="upload-csv"
                    accept=".csv"
                    hidden
                    onChange={handleCsvUpload}
                  />
                </Stack>
                <Card.Link
                  href="https://docs.google.com/spreadsheets/d/13oBKSJzKfW0yC8ghiZ_3EYWrjlZ9g8BU-mV91ezG_XU/edit?gid=0#gid=0"
                  target="_blank"
                  className="float-end mt-2 pe-1 text-primary"
                >
                  Template
                </Card.Link>
              </Card.Body>
            </Card>
            <Stack direction="vertical" className="mt-4">
              {poolConfig.immutable && (
                <Card.Text className="mb-1 text-danger">
                  Warning: You are changing your contract to "No Admin." You
                  won't be able to make changes after this transaction.
                </Card.Text>
              )}
              <Button
                disabled={
                  !hasChanges ||
                  (!poolConfig.immutable && !isValidAdminsEntry) ||
                  !isValidMembersEntry
                }
                className="w-100 py-2 fs-5"
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
                  "Update Flow Splitter"
                )}
              </Button>
            </Stack>
            <Toast
              show={!!transactionSuccess}
              autohide
              delay={5000}
              onClose={() => setTransactionSuccess("")}
              className="w-100 p-3 mt-3 fs-5"
              style={{
                background: "rgb(209, 231, 220.8)",
                color: "rgb(10, 54, 33.6)",
                borderColor: "rgb(163, 207, 186.6)",
              }}
            >
              Flow Splitter Updated Successfully!
            </Toast>
            {transactionError ? (
              <Alert variant="danger" className="w-100 mt-3">
                {transactionError}
              </Alert>
            ) : null}
          </>
        )}
      </Container>
      {showOpenFlow && (
        <OpenFlow
          show={showOpenFlow}
          network={network!}
          token={
            poolToken ?? {
              address: pool?.token ?? "",
              symbol: superfluidQueryRes?.token.symbol ?? "N/A",
              icon: "",
            }
          }
          pool={superfluidQueryRes?.pool}
          handleClose={() => setShowOpenFlow(false)}
        />
      )}
      {showInstantDistribution && (
        <InstantDistribution
          show={showInstantDistribution}
          network={network!}
          token={
            poolToken ?? {
              address: pool?.token ?? "",
              symbol: superfluidQueryRes?.token.symbol ?? "N/A",
              icon: "",
            }
          }
          pool={superfluidQueryRes?.pool}
          handleClose={() => setShowInstantDistribution(false)}
        />
      )}
    </>
  );
}
