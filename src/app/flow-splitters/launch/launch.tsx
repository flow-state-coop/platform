"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address, parseEventLogs, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Papa from "papaparse";
import { writeContract } from "@wagmi/core";
import { useLazyQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import FormCheck from "react-bootstrap/FormCheck";
import Form from "react-bootstrap/Form";
import InfoTooltip from "@/components/InfoTooltip";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { isNumber } from "@/lib/utils";

type LaunchProps = { defaultNetwork: Network };

type PoolConfig = {
  transferableUnits: boolean;
  immutable: boolean;
};

type Erc20Metadata = { name: string; symbol: string };

type CustomTokenEntry = {
  address: string;
  symbol: string;
  validationError: string;
};
type AdminEntry = { address: string; validationError: string };
type MemberEntry = { address: string; units: string; validationError: string };

const SUPERTOKEN_QUERY = gql`
  query SupertokenQuery($token: String!) {
    token(id: $token) {
      id
      isSuperToken
      symbol
    }
  }
`;

export default function Launch(props: LaunchProps) {
  const { defaultNetwork } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [selectedToken, setSelectedToken] = useState<Token>();
  const [poolConfig, setPoolConfig] = useState<PoolConfig>({
    transferableUnits: false,
    immutable: false,
  });
  const [customTokenEntry, setCustomTokenEntry] = useState<CustomTokenEntry>({
    address: "",
    symbol: "",
    validationError: "",
  });
  const [adminsEntry, setAdminsEntry] = useState<AdminEntry[]>([
    { address: "", validationError: "" },
  ]);
  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    { address: "", units: "", validationError: "" },
  ]);
  const [erc20Metadata, setErc20Metadata] = useState<Erc20Metadata>({
    name: "",
    symbol: "",
  });
  const [customTokenSelection, setCustomTokenSelection] = useState(false);
  const [transactionerror, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const [checkSuperToken] = useLazyQuery(SUPERTOKEN_QUERY, {
    client: getApolloClient("superfluid", selectedNetwork.id),
  });
  const router = useRouter();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();
  const postHog = usePostHog();

  const isValidAdminsEntry = adminsEntry.every(
    (adminEntry) =>
      adminEntry.validationError === "" && adminEntry.address !== "",
  );
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.validationError === "" &&
      memberEntry.address !== "" &&
      memberEntry.units !== "" &&
      memberEntry.units !== "0",
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

  useEffect(() => {
    if (address) {
      setAdminsEntry([{ address, validationError: "" }]);
    }
  }, [address]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      return;
    }

    const token = customTokenSelection
      ? (customTokenEntry.address as Address)
      : selectedToken
        ? selectedToken.address
        : selectedNetwork.tokens[0].address;

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const validAdmins = adminsEntry.filter(
        (adminEntry) =>
          adminEntry.validationError === "" && adminEntry.address !== "",
      );
      const validMembers = membersEntry.filter(
        (memberEntry) =>
          memberEntry.validationError === "" && memberEntry.address !== "",
      );
      const hash = await writeContract(wagmiConfig, {
        address: selectedNetwork.flowSplitter,
        abi: flowSplitterAbi,
        functionName: "createPool",
        args: [
          token,
          {
            transferabilityForUnitsOwner: poolConfig.transferableUnits,
            distributionFromAnyAddress: true,
          },
          {
            name: erc20Metadata.name ? erc20Metadata.name : "Flow Splitter",
            symbol: erc20Metadata.symbol ? erc20Metadata.symbol : "POOL",
            decimals: 0,
          },
          validMembers.map((member) => {
            return {
              account: member.address as Address,
              units: BigInt(member.units),
            };
          }),
          poolConfig.immutable
            ? []
            : validAdmins.map((admin) => admin.address as Address),
          "",
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });
      const poolId = parseEventLogs({
        abi: flowSplitterAbi,
        eventName: ["PoolCreated"],
        logs: receipt.logs,
      })[0].args.poolId;

      router.push(`/flow-splitters/${selectedNetwork.id}/${poolId}`);
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
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="mb-3 bg-transparent border-0 rounded-4 p-0">
            <Stack direction="horizontal" gap={1} className="align-items-start">
              <Card.Title className="mb-0 fs-5 text-secondary fw-semi-bold">
                Flow Splitter (beta)
              </Card.Title>
              <InfoTooltip
                position={{ bottom: isMobile }}
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
                    Flow Splitter shares are implemented as ERC20 tokens (with 0
                    decimals). This means shares can show in your wallet &
                    across block explorers like other tokens... but they have
                    built-in cashflow superpowers.
                    <br />
                    <br />
                    You can set a name and symbol to brand your Flow Splitter
                    for your use case.
                  </p>
                }
              />
            </Stack>
            <Card.Text className="text-info mt-1">
              The easiest way to split streams to your team, guild, DAO, or
              community: <br />
              Flow Splitters are onchain contracts that forward incoming streams
              to recipients in real time based on their % of shares in the
              Splitter.
              <br />
              <Card.Link
                href="https://docs.flowstate.network/platform/flow-splitters/"
                target="_blank"
                className="text-primary"
              >
                Learn more
              </Card.Link>{" "}
              or{" "}
              <Card.Link
                href="https://t.me/flowstatecoop"
                target="_blank"
                className="m-0 text-primary"
              >
                get help
              </Card.Link>
              .
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-5">
            <Form.Control
              type="text"
              placeholder="Name (Optional)"
              value={erc20Metadata.name}
              className="border-0 fw-semi-bold"
              style={{
                width: !isMobile ? "50%" : "",
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setErc20Metadata({ ...erc20Metadata, name: e.target.value })
              }
            />
            <Form.Control
              type="text"
              placeholder="Share Symbol (Optional)"
              value={erc20Metadata.symbol}
              className="mt-3 border-0 fw-semi-bold"
              style={{
                width: !isMobile ? "50%" : "",
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setErc20Metadata({ ...erc20Metadata, symbol: e.target.value })
              }
            />
          </Card.Body>
        </Card>
        <Card className="bg-lace-100 rounded-4 border-0 mt-8 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-5 text-secondary fw-semi-bold">
            Core Configuration
          </Card.Header>
          <Card.Body className="p-0">
            <Card.Text className="mt-2 text-info">
              Select the token your Flow Splitter will be used to distribute and
              whether recipients can transfer their shares. <br />
              Configuration in this section cannot be edited after deployment.
            </Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                style={{ width: 156, paddingTop: 12, paddingBottom: 12 }}
              >
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="align-items-center"
                >
                  <Image
                    src={selectedNetwork.icon}
                    alt="Network Icon"
                    width={18}
                    height={18}
                  />
                  {selectedNetwork.name}
                </Stack>
              </Dropdown.Toggle>
              <Dropdown.Menu className="border-0 lh-lg">
                {networks.map((network, i) => (
                  <Dropdown.Item
                    key={i}
                    className="fw-semi-bold"
                    onClick={() => {
                      setSelectedNetwork(network);
                      setSelectedToken(network.tokens[0]);
                    }}
                  >
                    <Stack direction="horizontal" gap={1}>
                      <Image
                        src={network.icon}
                        alt="Network Icon"
                        width={16}
                        height={16}
                      />
                      {network.name}
                    </Stack>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 1 : 3}
              className="align-items-start mt-2"
            >
              <Dropdown>
                <Dropdown.Toggle
                  className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                  style={{ width: 156, paddingTop: 12, paddingBottom: 12 }}
                >
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="align-items-center"
                  >
                    {!customTokenSelection && (
                      <Image
                        src={
                          selectedToken?.icon ?? selectedNetwork.tokens[0].icon
                        }
                        alt="Network Icon"
                        width={18}
                        height={18}
                      />
                    )}
                    {customTokenSelection && customTokenEntry?.symbol
                      ? customTokenEntry.symbol
                      : customTokenSelection
                        ? "Custom"
                        : (selectedToken?.symbol ??
                          selectedNetwork.tokens[0].symbol)}
                  </Stack>
                </Dropdown.Toggle>
                <Dropdown.Menu className="border-0 lh-lg">
                  {selectedNetwork.tokens.map((token, i) => (
                    <Dropdown.Item
                      key={i}
                      className="fw-semi-bold"
                      onClick={() => {
                        setCustomTokenSelection(false);
                        setSelectedToken(token);
                      }}
                    >
                      <Stack direction="horizontal" gap={1}>
                        <Image
                          src={token.icon}
                          alt="Token Icon"
                          width={16}
                          height={16}
                        />
                        {token.symbol}
                      </Stack>
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => setCustomTokenSelection(true)}
                  >
                    Custom
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              {customTokenSelection ? (
                <Stack
                  direction="vertical"
                  className="position-relative align-self-sm-end"
                >
                  <Form.Control
                    type="text"
                    value={customTokenEntry.address}
                    className="border-0 fw-semi-bold py-2"
                    style={{
                      width: !isMobile ? "50%" : "",
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={async (e) => {
                      const value = e.target.value;

                      let validationError = "";
                      let symbol = "";

                      if (!isAddress(value)) {
                        validationError = "Invalid Address";
                      } else {
                        const { data: superTokenQueryRes } =
                          await checkSuperToken({
                            variables: { token: value.toLowerCase() },
                          });

                        if (!superTokenQueryRes?.token?.isSuperToken) {
                          validationError = "Not a SuperToken";
                        } else {
                          symbol = superTokenQueryRes.token.symbol;
                        }
                      }

                      setCustomTokenEntry({
                        ...customTokenEntry,
                        address: value,
                        symbol,
                        validationError,
                      });
                    }}
                  />
                  {customTokenEntry.validationError && (
                    <Card.Text
                      className="position-absolute mb-0 ms-2 ps-1 text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {customTokenEntry.validationError}
                    </Card.Text>
                  )}
                </Stack>
              ) : (
                <Stack direction="vertical" className="align-self-sm-end">
                  <Form.Control
                    type="text"
                    disabled
                    className="border-0 fw-semi-bold py-3"
                    value={
                      selectedToken?.address ??
                      selectedNetwork.tokens[0].address
                    }
                    style={{
                      width: !isMobile ? "50%" : "",
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                  />
                </Stack>
              )}
            </Stack>
            <Stack direction="vertical" className="mt-6">
              <Form.Label className="d-flex gap-1 mb-2 fs-6 fw-semi-bold text-secondary">
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
                    <p className="fw-semi-bold">
                      Should recipients be able to transfer (or trade) their
                      distribution shares?
                      <br />
                      <br />
                      Carefully consider the implications with your Contract
                      Admin selection below and your particular use case before
                      choosing to enable transferability. This is not editable
                      after launch.
                    </p>
                  }
                />
              </Form.Label>
              <Stack direction="horizontal" gap={5}>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={!poolConfig.transferableUnits}
                    onChange={() =>
                      setPoolConfig({
                        ...poolConfig,
                        transferableUnits: false,
                      })
                    }
                  />
                  <FormCheck.Label className="fw-semi-bold">
                    Non-Transferable (Admin Only)
                  </FormCheck.Label>
                </FormCheck>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={!!poolConfig.transferableUnits}
                    onChange={() =>
                      setPoolConfig({
                        ...poolConfig,
                        transferableUnits: true,
                      })
                    }
                  />
                  <FormCheck.Label className="fw-semi-bold">
                    Transferable by Recipients
                  </FormCheck.Label>
                </FormCheck>
              </Stack>
            </Stack>
          </Card.Body>
        </Card>
        <Card className="bg-lace-100 rounded-4 border-0 mt-8 p-4">
          <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-5 text-secondary fw-semi-bold">
            Contract Admin
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
                  Set the address(es), including multisigs, that should be able
                  to update the shares of your Flow Splitter for your use case.
                  <br />
                  <br />
                  Admins can relinquish, transfer, or add others to the admin
                  role. If there are no admins, your Flow Splitter contract is
                  immutable.
                </p>
              }
            />
          </Card.Header>
          <Card.Body className="p-0 mt-4">
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
                  <FormCheck.Label className="fw-semi-bold">
                    Admin
                  </FormCheck.Label>
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
                  <FormCheck.Label className="fw-semi-bold">
                    No Admin
                  </FormCheck.Label>
                </FormCheck>
              </Stack>
              {!poolConfig.immutable && (
                <div className="mt-2">
                  {adminsEntry.map((adminEntry, i) => (
                    <Stack
                      direction="vertical"
                      className="position-relative mb-3"
                      key={`${adminEntry.address}-${i}`}
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
                          className="border-0 fw-semi-bold"
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
                    <Card.Text className="mb-0 ms-sm-2 ps-sm-1 fw-semi-bold">
                      Add another admin
                    </Card.Text>
                  </Button>
                </div>
              )}
            </Form.Group>
          </Card.Body>
        </Card>
        <Card className="bg-lace-100 rounded-4 border-0 mt-8 p-4">
          <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-5 text-secondary fw-semi-bold">
            Share Register
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
                  As tokens are streamed to the Flow Splitter, they're
                  proportionally distributed in real time to recipients
                  according to their percentage of the total outstanding shares.
                  <br />
                  <br />
                  Any changes to the total number of outstanding or a
                  recipient's shares will be reflected in the continuing stream
                  allocation.
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
                      placeholder={isMobile ? "Address" : "Recipient Address"}
                      value={memberEntry.address}
                      className="border-0 fw-semi-bold"
                      style={{
                        paddingTop: 12,
                        paddingBottom: 12,
                      }}
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
                    className="text-center border-0 fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevMembersEntry = [...membersEntry];
                      const value = e.target.value;

                      if (!value || value === "0") {
                        prevMembersEntry[i].units = "";
                      } else if (value.includes(".")) {
                        return;
                      } else if (isNumber(value)) {
                        prevMembersEntry[i].units = value;
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
                        !memberEntry.units || Number(memberEntry.units) === 0
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
                      className="bg-white text-center border-0 fw-semi-bold"
                      style={{
                        paddingTop: 12,
                        paddingBottom: 12,
                      }}
                    />
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => {
                        setMembersEntry((prev) =>
                          prev.filter(
                            (_, prevMemberEntryIndex) =>
                              prevMemberEntryIndex !== i,
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
                </Stack>
              </Stack>
            ))}
            <Stack direction="horizontal" gap={isMobile ? 2 : 4}>
              <Button
                variant="transparent"
                className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline fw-semi-bold"
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
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
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
                className="m-0 bg-secondary px-10 py-4 rounded-4 text-light text-center text-decoration-none fw-semi-bold"
              >
                Export Current
              </Card.Link>
              <Form.Label
                htmlFor="upload-csv"
                className="bg-primary text-white text-center m-0 px-10 py-4 rounded-4 cursor-pointer fw-semi-bold"
              >
                Upload CSV
              </Form.Label>
              <Form.Control
                type="file"
                id="upload-csv"
                accept=".csv"
                hidden
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                            isNumber(row[1]) &&
                            Number(row[1]) > 0 &&
                            !row[1].includes(".")
                              ? row[1]
                              : "",
                          validationError: !isAddress(row[0])
                            ? "Invalid Address"
                            : membersEntry
                                  .map((memberEntry) =>
                                    memberEntry.address.toLowerCase(),
                                  )
                                  .includes(row[0].toLowerCase())
                              ? "Address already added"
                              : "",
                        });
                      }

                      setMembersEntry(membersEntry);
                    },
                  });
                }}
              />
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
        <Stack direction="vertical" className="mt-6">
          {poolConfig.immutable && (
            <Card.Text className="mb-1 text-danger">
              Warning: You've set your contract to "No Admin." You won't be able
              to make changes after deployment.
            </Card.Text>
          )}
          <Button
            disabled={
              (!poolConfig.immutable && !isValidAdminsEntry) ||
              (customTokenSelection && !!customTokenEntry.validationError) ||
              !isValidMembersEntry
            }
            className="w-100 py-4 fs-6 fw-semi-bold rounded-4"
            onClick={() =>
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== selectedNetwork.id
                  ? switchChain({ chainId: selectedNetwork.id })
                  : handleSubmit()
            }
          >
            {isTransactionLoading ? (
              <Spinner size="sm" className="ms-2" />
            ) : (
              "Launch Flow Splitter"
            )}
          </Button>
        </Stack>
        {transactionerror ? (
          <Alert variant="danger" className="w-100 mt-3 fw-semi-bold">
            {transactionerror}
          </Alert>
        ) : null}
      </Stack>
    </>
  );
}
