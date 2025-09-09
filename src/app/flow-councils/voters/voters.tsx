"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, isAddress, keccak256, encodePacked } from "viem";
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
import Sidebar from "../components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { isNumber } from "@/lib/utils";

type VotersProps = { chainId?: number; flowCouncilId?: string };
type VoterEntry = {
  address: string;
  votingPower: string;
  addressValidationError: string;
  votesValidationError: string;
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($flowCouncilId: String!) {
    flowCouncil(id: $flowCouncilId) {
      id
      maxVotingSpread
      flowCouncilManagers {
        account
        role
      }
      voters(first: 1000) {
        id
        account
        votingPower
      }
    }
  }
`;

export default function Voters(props: VotersProps) {
  const { chainId, flowCouncilId } = props;

  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [flowCouncilConfig, setFlowCouncilConfig] = useState({
    limitMaxVotingSpread: false,
  });
  const [maxVotingSpread, setMaxVotingSpread] = useState("");
  const [votingPowerForAll, setVotingPowerForAll] = useState("");
  const [votersEntry, setVotersEntry] = useState<VoterEntry[]>([
    {
      address: "",
      votingPower: "",
      addressValidationError: "",
      votesValidationError: "",
    },
  ]);
  const [votersToRemove, setVotersToRemove] = useState<VoterEntry[]>([]);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        flowCouncilId: flowCouncilId?.toLowerCase(),
      },
      skip: !flowCouncilId,
      pollInterval: 4000,
    });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil ?? null;
  const isValidVotersEntry = votersEntry.every(
    (voterEntry) =>
      voterEntry.addressValidationError === "" &&
      voterEntry.votesValidationError === "" &&
      voterEntry.address !== "" &&
      voterEntry.votingPower !== "" &&
      voterEntry.votingPower !== "0",
  );
  const isManager = useMemo(() => {
    const voterManagerRole = keccak256(
      encodePacked(["string"], ["VOTER_MANAGER_ROLE"]),
    );
    const manager = flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === voterManagerRole,
    );

    if (manager) {
      return true;
    }

    return false;
  }, [address, flowCouncil]);

  const hasChanges = useMemo(() => {
    const compareArrays = (a: string[], b: string[]) =>
      a.length === b.length && a.every((elem, i) => elem === b[i]);

    const sortedVoters = flowCouncil?.voters
      ? [...flowCouncil.voters].sort(
          (a: { account: string }, b: { account: string }) =>
            a.account > b.account ? -1 : 1,
        )
      : [];
    const sortedVotersEntry = votersEntry
      ? [...votersEntry].sort((a, b) =>
          a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
        )
      : [];
    const hasChangesVoters =
      sortedVoters &&
      (!compareArrays(
        sortedVoters
          .filter((voter: { votingPower: string }) => voter.votingPower !== "0")
          .map((voter: { account: string }) => voter.account),
        sortedVotersEntry.map((voter) => voter.address.toLowerCase()),
      ) ||
        !compareArrays(
          sortedVoters
            .filter(
              (voter: { votingPower: string }) => voter.votingPower !== "0",
            )
            .map((voter: { votingPower: string }) => voter.votingPower),
          sortedVotersEntry.map((voter) => voter.votingPower),
        ));

    return (
      (!flowCouncilConfig.limitMaxVotingSpread &&
        flowCouncil?.maxVotingSpread !== 0) ||
      (flowCouncilConfig.limitMaxVotingSpread &&
        Number(maxVotingSpread) !== flowCouncil?.maxVotingSpread) ||
      hasChangesVoters
    );
  }, [flowCouncilConfig, maxVotingSpread, flowCouncil, votersEntry]);

  useEffect(() => {
    (async () => {
      if (!flowCouncil) {
        return;
      }

      const votersEntry = flowCouncil.voters
        .filter((voter: { votingPower: string }) => voter.votingPower !== "0")
        .map((voter: { account: string; votingPower: string }) => {
          return {
            address: voter.account,
            votingPower: voter.votingPower,
            addressValidationError: "",
            votesValidationError: "",
          };
        });

      setVotersEntry(
        votersEntry.length > 0
          ? votersEntry
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
        setFlowCouncilConfig((prev) => {
          return { ...prev, limitMaxVotingSpread: false };
        });
      } else {
        setFlowCouncilConfig((prev) => {
          return { ...prev, limitMaxVotingSpread: true };
        });
        setMaxVotingSpread(flowCouncil.maxVotingSpread);
      }
    })();
  }, [flowCouncil]);

  const removeVoterEntry = (voterEntry: VoterEntry, voterIndex: number) => {
    setVotersEntry((prev) =>
      prev.filter(
        (_, prevVoterEntryIndex) => prevVoterEntryIndex !== voterIndex,
      ),
    );

    const existingPoolMember = flowCouncil?.voters?.find(
      (voter: { account: string }) =>
        voter.account === voterEntry.address.toLowerCase(),
    );

    if (
      !voterEntry.addressValidationError &&
      !voterEntry.votesValidationError &&
      existingPoolMember &&
      existingPoolMember.units !== "0"
    ) {
      setVotersToRemove(votersToRemove.concat(voterEntry));
    }
  };

  const handleSubmit = async () => {
    if (!address || !publicClient || !flowCouncilId) {
      return;
    }

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const validVoters = votersEntry.filter(
        (voterEntry) =>
          voterEntry.addressValidationError === "" &&
          voterEntry.votesValidationError === "" &&
          voterEntry.address !== "" &&
          !flowCouncil?.voters.some(
            (voter: { account: string; votingPower: string }) =>
              voter.account === voterEntry.address &&
              voter.votingPower === voterEntry.votingPower,
          ),
      );
      const hash = await writeContract(wagmiConfig, {
        address: flowCouncilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateVoters",
        args: [
          validVoters
            .map((voter) => {
              return {
                account: voter.address as Address,
                votingPower: BigInt(voter.votingPower),
                votes: [],
              };
            })
            .concat(
              votersToRemove.map((voter) => {
                return {
                  account: voter.address as Address,
                  votingPower: BigInt(0),
                  votes: [],
                };
              }),
            ),
          flowCouncilConfig.limitMaxVotingSpread ? Number(maxVotingSpread) : 0,
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

  if (
    !flowCouncilId ||
    !chainId ||
    (!flowCouncilQueryLoading && !flowCouncil)
  ) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Flow Council not found.{" "}
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
        <Card className="bg-light rounded-4 border-0 mt-4 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0">
            <Card.Title className="fs-4">Flow Council Voters</Card.Title>
            <Card.Text className="fs-6 text-info">
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
              <Form.Label className="d-flex gap-1 mb-2 fs-5">
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
                    <>
                      Optional: Restrict how many recipients a voter can spread
                      their votes across.
                      <br />
                      <br />
                      This can be used to force differentiated opinions.
                    </>
                  }
                />
              </Form.Label>
              <Dropdown>
                <Dropdown.Toggle
                  disabled={!isManager}
                  className="d-flex justify-content-between align-items-center bg-white text-dark border"
                  style={{ width: 128 }}
                >
                  {flowCouncilConfig.limitMaxVotingSpread
                    ? maxVotingSpread
                    : "No Limit"}
                </Dropdown.Toggle>
                <Dropdown.Menu
                  className="overflow-auto"
                  style={{ height: 256 }}
                >
                  <Dropdown.Item
                    onClick={() => {
                      setFlowCouncilConfig({
                        ...flowCouncilConfig,
                        limitMaxVotingSpread: false,
                      });
                      setMaxVotingSpread("");
                    }}
                  >
                    No Limit
                  </Dropdown.Item>
                  {[...Array(51)].map((_, i) => {
                    if (i !== 0) {
                      return (
                        <Dropdown.Item
                          key={i}
                          onClick={() => {
                            setFlowCouncilConfig({
                              ...flowCouncilConfig,
                              limitMaxVotingSpread: true,
                            });
                            setMaxVotingSpread(i.toString());
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
                className="text-center rounded-2 flex-grow-0 flex-shrink-0"
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
                className="text-primary text-decoration-underline p-0 flex-grow-0 flex-shrink-0 border-0"
                style={{ width: 80, fontSize: "0.9rem" }}
                onClick={() =>
                  setVotersEntry((prev) => {
                    return prev.map((voterEntry) => {
                      return { ...voterEntry, votingPower: votingPowerForAll };
                    });
                  })
                }
              >
                Apply to All
              </Button>
            </Stack>
            {votersEntry.map((voterEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-end my-3"
                key={i}
              >
                <Stack direction="vertical" className="position-relative w-75">
                  <Form.Control
                    type="text"
                    placeholder="Voter Address"
                    value={voterEntry.address}
                    disabled={
                      !isManager ||
                      votersToRemove
                        .map((voter: { address: string }) =>
                          voter.address.toLowerCase(),
                        )
                        .includes(voterEntry.address.toLowerCase())
                    }
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevVotersEntry = [...votersEntry];
                      const value = e.target.value;

                      if (!isAddress(value)) {
                        prevVotersEntry[i].addressValidationError =
                          "Invalid Address";
                      } else if (
                        prevVotersEntry
                          .map((prevVoter) => prevVoter.address.toLowerCase())
                          .includes(value.toLowerCase())
                      ) {
                        prevVotersEntry[i].addressValidationError =
                          "Address already added";
                      } else {
                        prevVotersEntry[i].addressValidationError = "";
                      }

                      prevVotersEntry[i].address = value;

                      setVotersEntry(prevVotersEntry);
                    }}
                  />
                  {voterEntry.addressValidationError ? (
                    <Card.Text
                      className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {voterEntry.addressValidationError}
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
                    value={voterEntry.votingPower}
                    disabled={
                      !isManager ||
                      votersToRemove
                        .map((voter: { address: string }) =>
                          voter.address.toLowerCase(),
                        )
                        .includes(voterEntry.address.toLowerCase())
                    }
                    className="flex-grow-0 text-center"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevVotersEntry = [...votersEntry];
                      const value = e.target.value;

                      if (!!value && !isNumber(value)) {
                        prevVotersEntry[i].votesValidationError =
                          "Must be a number";
                      } else if (Number(value) === 0) {
                        prevVotersEntry[i].votesValidationError = "Must be > 0";
                      } else if (Number(value) > 1e6) {
                        prevVotersEntry[i].votesValidationError =
                          "Must be ≤ 1M";
                      } else if (value.includes(".")) {
                        prevVotersEntry[i].votesValidationError =
                          "Must be an integer";
                      } else {
                        prevVotersEntry[i].votesValidationError = "";
                      }

                      prevVotersEntry[i].votingPower = value;

                      setVotersEntry(prevVotersEntry);
                    }}
                  />
                  {voterEntry.votesValidationError ? (
                    <Card.Text
                      className="position-absolute w-100 mt-1 mb-0 text-center text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {voterEntry.votesValidationError}
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
                    removeVoterEntry(voterEntry, i);
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
            {votersToRemove.map((voterEntry, i) => (
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
                    value={voterEntry.address}
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Stack>
                <Form.Control
                  type="text"
                  disabled
                  value="Removed"
                  className="text-center flex-grow-0 flex-shrink-0"
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
                    setVotersToRemove((prev) =>
                      prev.filter(
                        (_, prevVoterEntryIndex) => prevVoterEntryIndex !== i,
                      ),
                    );
                    setVotersEntry(votersEntry.concat(voterEntry));
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
                className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline border-0"
                onClick={() =>
                  setVotersEntry((prev) =>
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
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="my-4">
          <Button
            disabled={!isManager || !hasChanges || !isValidVotersEntry}
            className="fs-5"
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
            className="fs-5"
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(
                `/flow-councils/review/?chainId=${chainId}&id=${flowCouncilId}`,
              )
            }
          >
            Next
          </Button>
          <Toast
            show={transactionSuccess}
            delay={4000}
            autohide={true}
            onClose={() => setTransactionSuccess(false)}
            className="w-100 bg-success p-3 fs-5 text-light"
          >
            Success!
          </Toast>
          {transactionError ? (
            <Alert variant="danger" className="w-100">
              {transactionError}
            </Alert>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}
