"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Address, isAddress, keccak256, encodePacked } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import FormCheck from "react-bootstrap/FormCheck";
import InputGroup from "react-bootstrap/InputGroup";
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
  validationError: string;
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
    isVotingPowerForAll: true,
  });
  const [maxAllocation, setMaxAllocation] = useState("");
  const [votingPowerForAll, setVotingPowerForAll] = useState("");
  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    { address: "", votingPower: "", validationError: "" },
  ]);
  const [membersToRemove, setMembersToRemove] = useState<MemberEntry[]>([]);

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
      pollInterval: 10000,
    },
  );

  const council = councilQueryRes?.council ?? null;
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.validationError === "" &&
      memberEntry.address !== "" &&
      ((councilConfig.isVotingPowerForAll && votingPowerForAll) ||
        (memberEntry.votingPower !== "" && memberEntry.votingPower !== "0")),
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
      !compareArrays(
        sortedCouncilMembers
          .filter(
            (member: { votingPower: string }) => member.votingPower !== "0",
          )
          .map((member: { account: string }) => member.account),
        sortedMembersEntry.map((member) => member.address.toLowerCase()),
      );

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
            validationError: "",
          };
        });

      if (membersEntry.length > 0) {
        setMembersEntry(membersEntry);
      }

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
      !memberEntry.validationError &&
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
          memberEntry.validationError === "" &&
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
                votingPower: councilConfig.isVotingPowerForAll
                  ? BigInt(votingPowerForAll)
                  : BigInt(member.votingPower),
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
        Your are manager for this council. Please make sure the right wallet is
        connected
      </span>
    );
  }

  return (
    <>
      {!isMobile && (
        <Stack direction="vertical" className="w-25 flex-grow-1">
          <Sidebar />
        </Stack>
      )}
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-3"}
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
              className="align-items-sm-center"
            >
              <Form.Label
                className="d-flex gap-1 mb-2 fs-5"
                style={{ width: isMobile ? "100%" : "25%" }}
              >
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
              <Stack direction="horizontal" gap={3}>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={!councilConfig.limitMaxAllocation}
                    onChange={() =>
                      setCouncilConfig({
                        ...councilConfig,
                        limitMaxAllocation: false,
                      })
                    }
                  />
                  <FormCheck.Label>No Limit</FormCheck.Label>
                </FormCheck>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={councilConfig.limitMaxAllocation}
                    onChange={() =>
                      setCouncilConfig({
                        ...councilConfig,
                        limitMaxAllocation: true,
                      })
                    }
                  />
                  <FormCheck.Label>Set Limit</FormCheck.Label>
                </FormCheck>
              </Stack>
            </Stack>
            {councilConfig.limitMaxAllocation && (
              <InputGroup className="mt-2">
                <Form.Label className="align-self-center w-25 m-0">
                  Limit
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  placeholder="10"
                  value={maxAllocation}
                  className="w-25 rounded-2 flex-grow-0"
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      (isNumber(e.target.value) && e.target.value !== "0.")
                    ) {
                      setMaxAllocation(e.target.value);
                    }
                  }}
                />
              </InputGroup>
            )}
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              className="align-items-sm-center mt-3"
            >
              <Form.Label
                className="d-flex gap-1 mb-2 fs-5"
                style={{ width: isMobile ? "100%" : "25%" }}
              >
                Voting Budget
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
                      Use this field to set a uniform voting budget for all
                      Council Members.
                      <br />
                      <br />
                      Set it to variable if you want to set each member's votes
                      individually.
                    </>
                  }
                />
              </Form.Label>
              <Stack direction="horizontal" gap={3}>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={councilConfig.isVotingPowerForAll}
                    onChange={() =>
                      setCouncilConfig({
                        ...councilConfig,
                        isVotingPowerForAll: true,
                      })
                    }
                  />
                  <FormCheck.Label>Same for All</FormCheck.Label>
                </FormCheck>
                <FormCheck type="radio">
                  <FormCheck.Input
                    type="radio"
                    checked={!councilConfig.isVotingPowerForAll}
                    onChange={() =>
                      setCouncilConfig({
                        ...councilConfig,
                        isVotingPowerForAll: false,
                      })
                    }
                  />
                  <FormCheck.Label>Individual</FormCheck.Label>
                </FormCheck>
              </Stack>
            </Stack>
            {councilConfig.isVotingPowerForAll && (
              <InputGroup className="mt-2">
                <Form.Label className="align-self-center w-25 m-0">
                  Voting per Member
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  placeholder="100"
                  value={votingPowerForAll}
                  className="w-25 rounded-2 flex-grow-0"
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      (isNumber(e.target.value) && e.target.value !== "0.")
                    ) {
                      setVotingPowerForAll(e.target.value);
                    }
                  }}
                />
              </InputGroup>
            )}
            {membersEntry.map((memberEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-start mt-4 mb-3"
                key={i}
              >
                <Stack direction="vertical" className="w-100">
                  <Stack direction="vertical" className="position-relative">
                    <Form.Control
                      type="text"
                      placeholder="Member Address"
                      value={memberEntry.address}
                      disabled={
                        council?.councilMembers
                          .map((member: { account: string }) =>
                            member.account.toLowerCase(),
                          )
                          .includes(memberEntry.address.toLowerCase()) &&
                        !memberEntry.validationError
                      }
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
                    placeholder="Votes"
                    value={
                      councilConfig.isVotingPowerForAll &&
                      !council?.councilMembers
                        .map((member: { account: string }) =>
                          member.account.toLowerCase(),
                        )
                        .includes(memberEntry.address.toLowerCase())
                        ? votingPowerForAll
                        : memberEntry.votingPower
                    }
                    disabled={
                      councilConfig.isVotingPowerForAll ||
                      council?.councilMembers
                        .map((member: { account: string }) =>
                          member.account.toLowerCase(),
                        )
                        .includes(memberEntry.address.toLowerCase())
                    }
                    className="text-center"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevMembersEntry = [...membersEntry];
                      const value = e.target.value;

                      if (!value || value === "0") {
                        prevMembersEntry[i].votingPower = "";
                      } else if (value.includes(".")) {
                        return;
                      } else if (isNumber(value)) {
                        prevMembersEntry[i].votingPower = value;
                      }

                      setMembersEntry(prevMembersEntry);
                    }}
                  />
                </Stack>
                <Button
                  variant="transparent"
                  className="p-0"
                  style={{
                    pointerEvents: isTransactionLoading ? "none" : "auto",
                  }}
                  onClick={() => {
                    removeMemberEntry(memberEntry, i);
                  }}
                >
                  <Image
                    src="/delete.svg"
                    alt="Remove"
                    width={28}
                    height={28}
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
                      validationError: "",
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
