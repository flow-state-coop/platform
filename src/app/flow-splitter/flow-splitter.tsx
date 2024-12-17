"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address, parseEventLogs, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import Papa from "papaparse";
import { writeContract } from "@wagmi/core";
import { useLazyQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import Container from "react-bootstrap/Container";
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
import { getApolloClient } from "@/lib/apollo";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { isNumber, truncateStr } from "@/lib/utils";

type PoolConfig = {
  transferableUnits: boolean;
  immutable: boolean;
};

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

export default function FlowSplitter() {
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
  const [customTokenSelection, setCustomTokenSelection] = useState(false);
  const [transactionerror, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const [checkSuperToken] = useLazyQuery(SUPERTOKEN_QUERY, {
    client: getApolloClient("superfluid", networks[1].id),
  });
  const router = useRouter();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();
  const postHog = usePostHog();

  const isValidAdminsEntry =
    adminsEntry.filter(
      (adminEntry) =>
        adminEntry.validationError === "" && adminEntry.address !== "",
    ).length > 0;
  const isValidMembersEntry =
    membersEntry.filter(
      (memberEntry) =>
        memberEntry.validationError === "" &&
        memberEntry.address !== "" &&
        memberEntry.units !== "" &&
        memberEntry.units !== "0",
    ).length > 0;

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
      const prevAdminsEntry = [...adminsEntry];

      prevAdminsEntry[0] = { address, validationError: "" };

      setAdminsEntry(prevAdminsEntry);
    }
  }, [address, adminsEntry]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      return;
    }

    const token = selectedToken
      ? selectedToken.address
      : networks[1].tokens[0].address;

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
        address: networks[1].flowSplitter,
        abi: flowSplitterAbi,
        functionName: "createPool",
        args: [
          token,
          {
            transferabilityForUnitsOwner: poolConfig.transferableUnits,
            distributionFromAnyAddress: true,
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
        confirmations: 3,
      });
      const poolAddress = parseEventLogs({
        abi: flowSplitterAbi,
        eventName: ["PoolCreated"],
        logs: receipt.logs,
      })[0].args.poolAddress;

      router.push(`/flow-splitter/11155420/${poolAddress}/manager`);
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
        <h1 className="mt-5">Launch a Flow Splitter</h1>
        <h2 className="text-info fs-5">
          A Flow Splitter allocates one or more incoming Superfluid token
          streams to recipients proportional to their unit share in real time.
        </h2>
        <Card className="bg-light rounded-4 border-0 mt-4 px-4 py-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-4">
            Configuration
          </Card.Header>
          <Card.Body className="p-0">
            <Card.Text className="text-info">
              These settings cannot be edited after deployment.
            </Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
                style={{ width: 156 }}
              >
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="align-items-center"
                >
                  <Image
                    src={networks[1].icon}
                    alt="Network Icon"
                    width={18}
                    height={18}
                  />
                  {networks[1].name}
                </Stack>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item>{networks[1].name}</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 1 : 3}
              className="align-items-start mt-2"
            >
              <Dropdown>
                <Dropdown.Toggle
                  className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
                  style={{ width: 156 }}
                >
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="align-items-center"
                  >
                    {!customTokenSelection && (
                      <Image
                        src={selectedToken?.icon ?? networks[1].tokens[0].icon}
                        alt="Network Icon"
                        width={18}
                        height={18}
                      />
                    )}
                    {customTokenSelection && customTokenEntry?.symbol
                      ? customTokenEntry.symbol
                      : customTokenSelection
                        ? "Custom"
                        : (selectedToken?.name ?? networks[1].tokens[0].name)}
                  </Stack>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {networks[1].tokens.map((token, i) => (
                    <Dropdown.Item
                      key={i}
                      onClick={() => {
                        setCustomTokenSelection(false);
                        setSelectedToken(token);
                      }}
                    >
                      {token.name}
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item onClick={() => setCustomTokenSelection(true)}>
                    Custom
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              {customTokenSelection && (
                <Stack direction="vertical" className="align-self-sm-end">
                  <Form.Control
                    type="text"
                    value={customTokenEntry.address}
                    style={{ width: !isMobile ? "50%" : "" }}
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
                    <Card.Text className="mb-0 ms-2 ps-1 text-danger">
                      {customTokenEntry.validationError}
                    </Card.Text>
                  )}
                </Stack>
              )}
            </Stack>
            <Form.Group className="mt-4">
              <Form.Label className="d-flex gap-1 fs-5">
                Distribution Units Update
                <InfoTooltip
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
                      able to update the distribution units of your Flow
                      Splitter for your use case.
                      <br />
                      <br />
                      Admins can relinquish, transfer, or add others to the
                      admin role. If there are no admins, your Flow Splitter
                      contract is immutable.
                    </>
                  }
                />
              </Form.Label>
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
                    <Stack direction="vertical" className="mb-2" key={i}>
                      <Stack
                        direction="horizontal"
                        gap={2}
                        className="align-items-center"
                      >
                        <Form.Control
                          key={i}
                          type="text"
                          value={truncateStr(
                            adminEntry.address,
                            isMobile || isTablet ? 22 : 42,
                          )}
                          style={{ width: !isMobile ? "50%" : "" }}
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
                        <Card.Text className="mb-0 ms-2 ps-1 text-danger small">
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
            <Stack direction="vertical" className="mt-4">
              <Form.Label className="d-flex gap-1 mb-2 fs-5">
                Distribution Units Transferability
                <InfoTooltip
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
                      Should recipients be able to transfer (or trade) their
                      distribution units?
                      <br />
                      <br />
                      Carefully consider the implications with your admin
                      selection above and your particular use case before
                      choosing to enable transferability. This is not editable
                      after launch.
                    </>
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
                  <FormCheck.Label>Non Transferable</FormCheck.Label>
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
                  <FormCheck.Label>Transferable by Recipients</FormCheck.Label>
                </FormCheck>
              </Stack>
            </Stack>
          </Card.Body>
        </Card>
        <Card className="bg-light rounded-4 border-0 mt-4 px-2 px-sm-4 py-4">
          <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-4">
            Distribution Units
            <InfoTooltip
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
                  according to their percentage of the total outstanding units.
                  <br />
                  <br />
                  Any changes to the total number of outstanding units or a
                  recipient's units will be reflected in the continuing stream
                  allocation.
                </>
              }
            />
          </Card.Header>
          <Card.Body className="p-0">
            {membersEntry.map((memberEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-start mb-2"
                key={i}
              >
                <Stack direction="vertical" className="w-100">
                  <Stack direction="vertical">
                    <Form.Control
                      type="text"
                      placeholder={isMobile ? "Address" : "Recipient Address"}
                      value={truncateStr(
                        memberEntry.address,
                        isMobile || isTablet ? 14 : 42,
                      )}
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
                      <Card.Text className="mt-1 mb-0 ms-2 ps-1 text-danger small">
                        {memberEntry.validationError}
                      </Card.Text>
                    ) : null}
                  </Stack>
                </Stack>
                <Stack direction="vertical">
                  <Form.Control
                    type="text"
                    placeholder="Units"
                    value={memberEntry.units}
                    onChange={(e) => {
                      const prevMembersEntry = [...membersEntry];
                      const value = e.target.value;

                      if (!value || value === "0" || value === ".") {
                        prevMembersEntry[i].units = "";
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
                              ).toFixed(isMobile ? 0 : 2),
                            )}%`
                      }
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
                  className="bg-transparent text-info border-0"
                  value={totalUnits}
                />
              </Stack>
              <Stack>
                <Form.Control
                  type="text"
                  disabled
                  className="bg-transparent text-info border-0"
                  value="100%"
                />
              </Stack>
              <span style={{ width: 4 }} />
            </Stack>
            <Stack
              direction="vertical"
              className="ms-auto mt-3"
              style={{ width: isMobile ? "" : 256 }}
            >
              <Form.Label
                htmlFor="upload-csv"
                className="bg-primary text-white text-center fs-5 px-3 py-2 rounded-3 cursor-pointer"
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
                            isNumber(row[1]) && Number(row[1]) > 0
                              ? row[1].split(".")[0]
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
              <Stack
                direction="horizontal"
                gap={4}
                className="justify-content-center"
              >
                <Card.Link
                  href="https://docs.google.com/spreadsheets/d/13oBKSJzKfW0yC8ghiZ_3EYWrjlZ9g8BU-mV91ezG_XU/edit?gid=0#gid=0"
                  target="_blank"
                  className="text-primary"
                >
                  Template
                </Card.Link>
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
                  className="m-0 text-primary"
                >
                  Export Current
                </Card.Link>
              </Stack>
            </Stack>
          </Card.Body>
        </Card>
        <Button
          disabled={
            (!poolConfig.immutable && !isValidAdminsEntry) ||
            (customTokenSelection && !!customTokenEntry.validationError) ||
            !isValidMembersEntry ||
            !address
          }
          className="w-100 mt-4"
          onClick={() =>
            connectedChain?.id === networks[1].id
              ? handleSubmit()
              : switchChain({ chainId: networks[1].id })
          }
        >
          {isTransactionLoading ? (
            <Spinner size="sm" className="ms-2" />
          ) : (
            "Launch Flow Splitter"
          )}
        </Button>
        {transactionerror ? (
          <Alert variant="danger" className="w-100 mt-3">
            {transactionerror}
          </Alert>
        ) : null}
      </Container>
    </>
  );
}
