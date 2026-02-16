"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import InfoTooltip from "@/components/InfoTooltip";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { VOTER_MANAGER_ROLE } from "../lib/constants";
import Papa from "papaparse";
import { isNumber } from "@/lib/utils";

type MembershipProps = { chainId?: number; councilId?: string };
type MemberEntry = {
  address: string;
  votingPower: string;
  addressValidationError: string;
  votesValidationError: string;
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilVotersQuery($councilId: String!, $skip: Int = 0) {
    flowCouncil(id: $councilId) {
      id
      maxVotingSpread
      flowCouncilManagers {
        account
        role
      }
      voters(first: 1000, skip: $skip) {
        id
        account
        votingPower
      }
    }
  }
`;

export default function Membership(props: MembershipProps) {
  const { chainId, councilId } = props;

  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [councilConfig, setCouncilConfig] = useState({
    limitMaxAllocation: false,
  });
  const [maxAllocation, setMaxAllocation] = useState("");
  const [votingPowerForAll, setVotingPowerForAll] = useState("");
  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    {
      address: "",
      votingPower: "",
      addressValidationError: "",
      votesValidationError: "",
    },
  ]);
  const [membersToRemove, setMembersToRemove] = useState<MemberEntry[]>([]);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const {
    data: flowCouncilQueryRes,
    loading: flowCouncilQueryResLoading,
    fetchMore,
  } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      chainId,
      councilId: councilId?.toLowerCase(),
    },
    pollInterval: 4000,
    skip: !councilId,
  });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil ?? null;
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.addressValidationError === "" &&
      memberEntry.votesValidationError === "" &&
      memberEntry.address !== "" &&
      memberEntry.votingPower !== "" &&
      memberEntry.votingPower !== "0",
  );
  const isManager = useMemo(() => {
    const flowCouncilManager = flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === VOTER_MANAGER_ROLE,
    );

    if (flowCouncilManager) {
      return true;
    }

    return false;
  }, [address, flowCouncil]);

  const hasChanges = useMemo(() => {
    const compareArrays = (a: string[], b: string[]) =>
      a.length === b.length && a.every((elem, i) => elem === b[i]);

    const sortedFlowCouncilVoters = flowCouncil?.voters?.toSorted(
      (a: { account: string }, b: { account: string }) =>
        a.account > b.account ? -1 : 1,
    );
    const sortedMembersEntry = membersEntry.toSorted((a, b) =>
      a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
    );
    const hasChangesMembers =
      sortedFlowCouncilVoters &&
      (!compareArrays(
        sortedFlowCouncilVoters
          .filter(
            (member: { votingPower: string }) => member.votingPower !== "0",
          )
          .map((member: { account: string }) => member.account),
        sortedMembersEntry.map((member) => member.address.toLowerCase()),
      ) ||
        !compareArrays(
          sortedFlowCouncilVoters
            .filter(
              (member: { votingPower: string }) => member.votingPower !== "0",
            )
            .map((member: { votingPower: string }) => member.votingPower),
          sortedMembersEntry.map((member) => member.votingPower),
        ));

    return (
      (!councilConfig.limitMaxAllocation &&
        flowCouncil?.maxVotingSpread !== 0) ||
      (councilConfig.limitMaxAllocation &&
        Number(maxAllocation) !== flowCouncil?.maxVotingSpread) ||
      hasChangesMembers
    );
  }, [councilConfig, maxAllocation, flowCouncil, membersEntry]);

  useEffect(() => {
    if (!flowCouncilQueryRes) {
      return;
    }

    fetchMore({
      variables: { skip: flowCouncilQueryRes.flowCouncil.voters.length },
    });
  }, [flowCouncilQueryRes, fetchMore]);

  useEffect(() => {
    (async () => {
      if (!flowCouncil) {
        return;
      }

      const membersEntry = flowCouncil.voters
        .filter((member: { votingPower: string }) => member.votingPower !== "0")
        .map((member: { account: string; votingPower: string }) => {
          return {
            address: member.account,
            votingPower: member.votingPower,
            addressValidationError: "",
            votesValidationError: "",
          };
        });

      setMembersEntry(
        membersEntry.length > 0
          ? membersEntry
          : [
              {
                address: "",
                votingPower: "",
                addressValidationError: "",
                votesValidationError: "",
              },
            ],
      );

      if (flowCouncil.maxVotingSpread === 0) {
        setCouncilConfig((prev) => {
          return { ...prev, limitMaxAllocation: false };
        });
      } else {
        setCouncilConfig((prev) => {
          return { ...prev, limitMaxAllocation: true };
        });
        setMaxAllocation(flowCouncil.maxVotingSpread);
      }
    })();
  }, [flowCouncil]);

  const removeMemberEntry = (memberEntry: MemberEntry, memberIndex: number) => {
    setMembersEntry((prev) =>
      prev.filter(
        (_, prevMemberEntryIndex) => prevMemberEntryIndex !== memberIndex,
      ),
    );

    const existingVoter = flowCouncil?.voters?.find(
      (member: { account: string }) =>
        member.account === memberEntry.address.toLowerCase(),
    );

    if (
      !memberEntry.addressValidationError &&
      !memberEntry.votesValidationError &&
      existingVoter &&
      existingVoter.votingPower !== "0"
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

        const newMembersEntry: MemberEntry[] = [];

        for (const row of data) {
          if (!row[0]) {
            continue;
          }

          newMembersEntry.push({
            address: row[0],
            votingPower:
              isNumber(row[1]) && !row[1].includes(".")
                ? row[1].replace(/\s/g, "")
                : "",
            addressValidationError: !isAddress(row[0])
              ? "Invalid Address"
              : newMembersEntry
                    .map((memberEntry) => memberEntry.address.toLowerCase())
                    .includes(row[0].toLowerCase())
                ? "Address already added"
                : "",
            votesValidationError:
              !isNumber(row[1]) || row[1].includes(".")
                ? "Must be a number"
                : Number(row[1]) === 0
                  ? "Must be > 0"
                  : Number(row[1]) > 1e6
                    ? "Must be ≤ 1M"
                    : "",
          });
        }

        const csvMembersToRemove: MemberEntry[] = [];

        const csvAddresses = data.map((row) => row[0]?.toLowerCase());
        const existingVoters = flowCouncil?.voters?.filter(
          (member: { votingPower: string }) => member.votingPower !== "0",
        );

        if (existingVoters) {
          for (const existingVoter of existingVoters) {
            if (
              !csvAddresses.includes(
                (existingVoter as { account: string }).account,
              )
            ) {
              csvMembersToRemove.push({
                address: (existingVoter as { account: string }).account,
                votingPower: (existingVoter as { votingPower: string })
                  .votingPower,
                addressValidationError: "",
                votesValidationError: "",
              });
            }
          }
        }

        setMembersEntry(newMembersEntry);
        setMembersToRemove(csvMembersToRemove);
      },
    });
  };

  const handleSubmit = async () => {
    if (!address || !publicClient || !councilId) {
      return;
    }

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const validMembers = membersEntry.filter(
        (memberEntry) =>
          memberEntry.addressValidationError === "" &&
          memberEntry.votesValidationError === "" &&
          memberEntry.address !== "" &&
          !flowCouncil?.voters.some(
            (member: { account: string; votingPower: string }) =>
              member.account === memberEntry.address.toLowerCase() &&
              member.votingPower === memberEntry.votingPower,
          ),
      );
      const hash = await writeContract(wagmiConfig, {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateVoters",
        args: [
          validMembers
            .map((member) => {
              return {
                account: member.address as Address,
                votingPower: BigInt(member.votingPower),
                votes: [],
              };
            })
            .concat(
              membersToRemove.map((member) => {
                return {
                  account: member.address as Address,
                  votingPower: BigInt(0),
                  votes: [],
                };
              }),
            ),
          councilConfig.limitMaxAllocation ? Number(maxAllocation) : 0,
        ],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      });

      setTransactionSuccess(true);
      setIsTransactionLoading(false);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  if (!councilId || !chainId || (!flowCouncilQueryResLoading && !flowCouncil)) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Council Membership
            </Card.Title>
            <Card.Text className="text-info">
              {isManager
                ? "Manage your council membership and how they can vote."
                : "(Read only—check your connected wallet's permissions to make changes)"}
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 1 : 4}
              className="align-items-sm-center"
            >
              <Form.Label className="d-flex gap-2 mb-2 fs-lg">
                Max Voting Spread
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
                      Optional: Restrict how many recipients a voter can spread
                      their votes across.
                      <br />
                      <br />
                      This can be used to force differentiated opinions.
                    </p>
                  }
                />
              </Form.Label>
              <Dropdown>
                <Dropdown.Toggle
                  disabled={!isManager}
                  className="d-flex justify-content-between align-items-center bg-white text-dark border-0 py-4 fw-semi-bold"
                  style={{ width: 128 }}
                >
                  {councilConfig.limitMaxAllocation
                    ? maxAllocation
                    : "No Limit"}
                </Dropdown.Toggle>
                <Dropdown.Menu
                  className="overflow-auto border-0 lh-lg p-2"
                  style={{ height: 256 }}
                >
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => {
                      setCouncilConfig({
                        ...councilConfig,
                        limitMaxAllocation: false,
                      });
                      setMaxAllocation("");
                    }}
                  >
                    No Limit
                  </Dropdown.Item>
                  {[...Array(51)].map((_, i) => {
                    if (i !== 0) {
                      return (
                        <Dropdown.Item
                          key={i}
                          className="fw-semi-bold"
                          onClick={() => {
                            setCouncilConfig({
                              ...councilConfig,
                              limitMaxAllocation: true,
                            });
                            setMaxAllocation(i.toString());
                          }}
                        >
                          {i}
                        </Dropdown.Item>
                      );
                    }

                    return null;
                  })}
                </Dropdown.Menu>
              </Dropdown>
            </Stack>
            <Stack
              direction="horizontal"
              className="justify-content-end my-3"
              gap={isMobile ? 2 : 4}
            >
              <span className="w-75" />
              <Form.Control
                type="text"
                disabled={!isManager}
                inputMode="numeric"
                placeholder="Votes"
                value={votingPowerForAll}
                className="text-center rounded-4 py-4 fw-semi-bold flex-grow-0 flex-shrink-0 border-0"
                style={{
                  width: isMobile ? 100 : 128,
                  paddingTop: 12,
                  paddingBottom: 12,
                }}
                onChange={(e) => {
                  if (
                    e.target.value === "" ||
                    (isNumber(e.target.value) &&
                      e.target.value !== "0." &&
                      Number(e.target.value) <= 1e6)
                  ) {
                    setVotingPowerForAll(e.target.value);
                  }
                }}
              />
              <Button
                variant="transparent"
                disabled={!isManager}
                className="text-primary text-decoration-underline p-0 flex-grow-0 flex-shrink-0 border-0 fw-semi-bold"
                style={{ width: 80, fontSize: "0.9rem" }}
                onClick={() =>
                  setMembersEntry((prev) => {
                    return prev.map((memberEntry) => {
                      return { ...memberEntry, votingPower: votingPowerForAll };
                    });
                  })
                }
              >
                Apply All
              </Button>
            </Stack>
            {membersEntry.map((memberEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-end my-3"
                key={i}
              >
                <Stack direction="vertical" className="position-relative w-75">
                  <Form.Control
                    type="text"
                    placeholder="Member Address"
                    value={memberEntry.address}
                    disabled={
                      !isManager ||
                      membersToRemove
                        .map((member: { address: string }) =>
                          member.address.toLowerCase(),
                        )
                        .includes(memberEntry.address.toLowerCase())
                    }
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevMembersEntry = [...membersEntry];
                      const value = e.target.value;

                      if (!isAddress(value)) {
                        prevMembersEntry[i].addressValidationError =
                          "Invalid Address";
                      } else if (
                        prevMembersEntry
                          .map((prevMember) => prevMember.address.toLowerCase())
                          .includes(value.toLowerCase())
                      ) {
                        prevMembersEntry[i].addressValidationError =
                          "Address already added";
                      } else {
                        prevMembersEntry[i].addressValidationError = "";
                      }

                      prevMembersEntry[i].address = value;

                      setMembersEntry(prevMembersEntry);
                    }}
                  />
                  {memberEntry.addressValidationError ? (
                    <Card.Text
                      className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger fw-semi-bold"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {memberEntry.addressValidationError}
                    </Card.Text>
                  ) : null}
                </Stack>
                <Stack
                  direction="vertical"
                  className="position-relative flex-grow-0 flex-shrink-0"
                  style={{
                    width: isMobile ? 100 : 128,
                  }}
                >
                  <Form.Control
                    type="text"
                    inputMode="numeric"
                    placeholder="Votes"
                    value={memberEntry.votingPower}
                    disabled={
                      !isManager ||
                      membersToRemove
                        .map((member: { address: string }) =>
                          member.address.toLowerCase(),
                        )
                        .includes(memberEntry.address.toLowerCase())
                    }
                    className="flex-grow-0 text-center border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevMembersEntry = [...membersEntry];
                      const value = e.target.value;

                      if (!!value && !isNumber(value)) {
                        prevMembersEntry[i].votesValidationError =
                          "Must be a number";
                      } else if (Number(value) === 0) {
                        prevMembersEntry[i].votesValidationError =
                          "Must be > 0";
                      } else if (Number(value) > 1e6) {
                        prevMembersEntry[i].votesValidationError =
                          "Must be ≤ 1M";
                      } else if (value.includes(".")) {
                        prevMembersEntry[i].votesValidationError =
                          "Must be an integer";
                      } else {
                        prevMembersEntry[i].votesValidationError = "";
                      }

                      prevMembersEntry[i].votingPower = value;

                      setMembersEntry(prevMembersEntry);
                    }}
                  />
                  {memberEntry.votesValidationError ? (
                    <Card.Text
                      className="position-absolute w-100 mt-1 mb-0 text-center text-danger fw-semi-bold"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {memberEntry.votesValidationError}
                    </Card.Text>
                  ) : null}
                </Stack>
                <Button
                  variant="transparent"
                  disabled={!isManager}
                  className="p-0 flex-grow-0 flex-shrink-0 border-0"
                  style={{
                    width: 80,
                    pointerEvents: isTransactionLoading ? "none" : "auto",
                  }}
                  onClick={() => {
                    removeMemberEntry(memberEntry, i);
                  }}
                >
                  <Image
                    src="/delete.svg"
                    alt="Remove"
                    width={36}
                    height={36}
                  />
                </Button>
              </Stack>
            ))}
            {membersToRemove.map((memberEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-end mb-3"
                key={i}
              >
                <Stack direction="vertical" className="w-75">
                  <Form.Control
                    disabled
                    type="text"
                    value={memberEntry.address}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Stack>
                <Form.Control
                  type="text"
                  disabled
                  value="Removed"
                  className="text-center flex-grow-0 rounded-4 py-4 fw-semi-bold bg-light border-0 flex-shrink-0"
                  style={{
                    width: isMobile ? 100 : 128,
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                />
                <Button
                  variant="transparent"
                  disabled={!isManager}
                  className="p-0 flex-grow-0 flex-shrink-0 border-0"
                  style={{ width: 80 }}
                  onClick={() => {
                    setMembersToRemove((prev) =>
                      prev.filter(
                        (_, prevMemberEntryIndex) => prevMemberEntryIndex !== i,
                      ),
                    );
                    setMembersEntry(membersEntry.concat(memberEntry));
                  }}
                >
                  <Image
                    src="/add-circle.svg"
                    alt="Add"
                    width={36}
                    height={36}
                  />
                </Button>
              </Stack>
            ))}
            <Stack direction="horizontal" gap={isMobile ? 2 : 4}>
              <Button
                variant="transparent"
                disabled={!isManager}
                className="d-flex align-items-center w-100 p-0 fw-semi-bold text-primary text-decoration-underline border-0"
                onClick={() =>
                  setMembersEntry((prev) =>
                    prev.concat({
                      address: "",
                      votingPower: "",
                      addressValidationError: "",
                      votesValidationError: "",
                    }),
                  )
                }
              >
                <Card.Text className="mb-0">
                  {isMobile ? "Add member" : "Add another member"}
                </Card.Text>
              </Button>
            </Stack>
            <Stack
              direction="horizontal"
              gap={2}
              className="justify-content-end mt-3"
            >
              <Card.Link
                href={URL.createObjectURL(
                  new Blob([
                    Papa.unparse(
                      membersEntry.map((memberEntry) => {
                        return [memberEntry.address, memberEntry.votingPower];
                      }),
                    ),
                  ]),
                )}
                target="_blank"
                download="Flow_Council.csv"
                className="m-0 bg-secondary px-10 py-4 rounded-4 text-light fw-semi-bold text-decoration-none"
              >
                Export Current
              </Card.Link>
              <>
                <Form.Label
                  htmlFor="upload-council-csv"
                  className={`text-white fw-semi-bold text-center m-0 px-10 py-4 rounded-4 ${isManager ? "bg-primary cursor-pointer" : "bg-info opacity-75"}`}
                >
                  Upload CSV
                </Form.Label>
                <Form.Control
                  type="file"
                  id="upload-council-csv"
                  accept=".csv"
                  hidden
                  disabled={!isManager}
                  onChange={handleCsvUpload}
                />
              </>
            </Stack>
            <Card.Link
              href="https://docs.google.com/spreadsheets/d/1BKo20lc4ZdRWKjvxQuTcOldQo_qL7Y5tXOvhFMJlwug/edit?gid=0#gid=0"
              target="_blank"
              className="float-end mt-2 pe-1 text-primary fw-semi-bold"
            >
              Template
            </Card.Link>
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-6 mb-30">
          <Button
            disabled={!isManager || !hasChanges || !isValidMembersEntry}
            className="fs-lg fw-semi-bold py-4 rounded-4"
            onClick={() => {
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== chainId
                  ? switchChain({ chainId })
                  : handleSubmit();
            }}
          >
            {isTransactionLoading ? (
              <Spinner size="sm" className="ms-2" />
            ) : (
              "Submit"
            )}
          </Button>
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold py-4 rounded-4"
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(`/flow-councils/review/${chainId}/${councilId}`)
            }
          >
            Next
          </Button>
          <Toast
            show={transactionSuccess}
            delay={4000}
            autohide={true}
            onClose={() => setTransactionSuccess(false)}
            className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
          >
            Success!
          </Toast>
          {transactionError ? (
            <Alert
              variant="danger"
              className="w-100 p-4 fw-semi-bold text-danger"
            >
              {transactionError}
            </Alert>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}
