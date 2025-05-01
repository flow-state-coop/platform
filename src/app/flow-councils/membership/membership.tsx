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
import { councilAbi } from "@/lib/abi/council";
import { isNumber } from "@/lib/utils";

type MembershipProps = { chainId?: number; councilId?: string };
type MemberEntry = {
  address: string;
  votingPower: string;
  addressValidationError: string;
  votesValidationError: string;
};

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String!) {
    council(id: $councilId) {
      id
      maxAllocationsPerMember
      councilManagers {
        account
        role
      }
      councilMembers {
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
  const { data: councilQueryRes, loading: councilQueryResLoading } = useQuery(
    COUNCIL_QUERY,
    {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !councilId,
      pollInterval: 4000,
    },
  );

  const council = councilQueryRes?.council ?? null;
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.addressValidationError === "" &&
      memberEntry.votesValidationError === "" &&
      memberEntry.address !== "" &&
      memberEntry.votingPower !== "" &&
      memberEntry.votingPower !== "0",
  );
  const isManager = useMemo(() => {
    const memberManagerRole = keccak256(
      encodePacked(["string"], ["MEMBER_MANAGER_ROLE"]),
    );
    const councilManager = council?.councilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === memberManagerRole,
    );

    if (councilManager) {
      return true;
    }

    return false;
  }, [address, council]);

  const hasChanges = useMemo(() => {
    const compareArrays = (a: string[], b: string[]) =>
      a.length === b.length && a.every((elem, i) => elem === b[i]);

    const sortedCouncilMembers = council?.councilMembers?.toSorted(
      (a: { account: string }, b: { account: string }) =>
        a.account > b.account ? -1 : 1,
    );
    const sortedMembersEntry = membersEntry.toSorted((a, b) =>
      a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
    );
    const hasChangesMembers =
      sortedCouncilMembers &&
      (!compareArrays(
        sortedCouncilMembers
          .filter(
            (member: { votingPower: string }) => member.votingPower !== "0",
          )
          .map((member: { account: string }) => member.account),
        sortedMembersEntry.map((member) => member.address.toLowerCase()),
      ) ||
        !compareArrays(
          sortedCouncilMembers
            .filter(
              (member: { votingPower: string }) => member.votingPower !== "0",
            )
            .map((member: { votingPower: string }) => member.votingPower),
          sortedMembersEntry.map((member) => member.votingPower),
        ));

    return (
      (!councilConfig.limitMaxAllocation &&
        council?.maxAllocationsPerMember !== 0) ||
      (councilConfig.limitMaxAllocation &&
        Number(maxAllocation) !== council?.maxAllocationsPerMember) ||
      hasChangesMembers
    );
  }, [councilConfig, maxAllocation, council, membersEntry]);

  useEffect(() => {
    (async () => {
      if (!council) {
        return;
      }

      const membersEntry = council.councilMembers
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

      if (council.maxAllocationsPerMember === 0) {
        setCouncilConfig((prev) => {
          return { ...prev, limitMaxAllocation: false };
        });
      } else {
        setCouncilConfig((prev) => {
          return { ...prev, limitMaxAllocation: true };
        });
        setMaxAllocation(council.maxAllocationsPerMember);
      }
    })();
  }, [council]);

  const removeMemberEntry = (memberEntry: MemberEntry, memberIndex: number) => {
    setMembersEntry((prev) =>
      prev.filter(
        (_, prevMemberEntryIndex) => prevMemberEntryIndex !== memberIndex,
      ),
    );

    const existingPoolMember = council?.councilMembers?.find(
      (member: { account: string }) =>
        member.account === memberEntry.address.toLowerCase(),
    );

    if (
      !memberEntry.addressValidationError &&
      !memberEntry.votesValidationError &&
      existingPoolMember &&
      existingPoolMember.units !== "0"
    ) {
      setMembersToRemove(membersToRemove.concat(memberEntry));
    }
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
          !council?.councilMembers.some(
            (member: { account: string; votingPower: string }) =>
              member.account === memberEntry.address &&
              member.votingPower === memberEntry.votingPower,
          ),
      );
      const hash = await writeContract(wagmiConfig, {
        address: councilId as Address,
        abi: councilAbi,
        functionName: "updateCouncilMembership",
        args: [
          validMembers
            .map((member) => {
              return {
                member: member.address as Address,
                votingPower: BigInt(member.votingPower),
              };
            })
            .concat(
              membersToRemove.map((member) => {
                return {
                  member: member.address as Address,
                  votingPower: BigInt(0),
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

      router.push(
        `/flow-councils/review/?chainId=${chainId}&councilId=${councilId}`,
      );
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  if (!councilId || !chainId || (!councilQueryResLoading && !council)) {
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

  if (council && !isManager) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Your are not a manager for this council. Please make sure the right
        wallet is connected
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
            <Card.Title className="fs-4">Council Membership</Card.Title>
            <Card.Text className="fs-6 text-info">
              Manage your council membership and how they can vote.
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
                  className="d-flex justify-content-between align-items-center bg-white text-dark border"
                  style={{ width: 128 }}
                >
                  {councilConfig.limitMaxAllocation
                    ? maxAllocation
                    : "No Limit"}
                </Dropdown.Toggle>
                <Dropdown.Menu
                  className="overflow-auto"
                  style={{ height: 256 }}
                >
                  <Dropdown.Item
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
                  {[...Array(256)].map((_, i) => {
                    return (
                      <Dropdown.Item
                        key={i}
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
                className="text-primary text-decoration-underline p-0 flex-grow-0 flex-shrink-0"
                style={{ width: 80, fontSize: "0.9rem" }}
                onClick={() =>
                  setMembersEntry((prev) => {
                    return prev.map((memberEntry) => {
                      return { ...memberEntry, votingPower: votingPowerForAll };
                    });
                  })
                }
              >
                Apply to All
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
                    disabled={membersToRemove
                      .map((member: { address: string }) =>
                        member.address.toLowerCase(),
                      )
                      .includes(memberEntry.address.toLowerCase())}
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
                      className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger"
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
                    disabled={membersToRemove
                      .map((member: { address: string }) =>
                        member.address.toLowerCase(),
                      )
                      .includes(memberEntry.address.toLowerCase())}
                    className="flex-grow-0 text-center"
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
                      className="position-absolute w-100 mt-1 mb-0 text-center text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {memberEntry.votesValidationError}
                    </Card.Text>
                  ) : null}
                </Stack>
                <Button
                  variant="transparent"
                  className="p-0 flex-grow-0 flex-shrink-0"
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
                  className="p-0 flex-grow-0 flex-shrink-0"
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
                className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline"
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
          </Card.Body>
        </Card>
        <Button
          disabled={!hasChanges || !isValidMembersEntry}
          className="my-4 fs-5"
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
        <Toast
          show={transactionSuccess}
          delay={4000}
          autohide={true}
          onClose={() => setTransactionSuccess(false)}
          className="w-100 bg-success mt-2 p-3 fs-5 text-light"
        >
          Success!
        </Toast>
        {transactionError ? (
          <Alert variant="danger" className="w-100 mb-4">
            {transactionError}
          </Alert>
        ) : null}
      </Stack>
    </>
  );
}
