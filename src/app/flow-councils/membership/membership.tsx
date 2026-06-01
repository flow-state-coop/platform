"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
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
import Table from "react-bootstrap/Table";
import Modal from "react-bootstrap/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import { waitForReceipt } from "@/lib/utils";
import { isNumber } from "@/lib/utils";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks, isSplitterFactoryDeployed } from "@/lib/networks";
import useCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import { useChunkedTxQueue } from "@/app/flow-councils/hooks/useChunkedTxQueue";
import {
  computeCastVotes,
  shareOfVotes,
} from "@/app/flow-councils/lib/voterUtils";
import {
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  DEFAULT_ADMIN_ROLE,
} from "../lib/constants";

type MembershipProps = { chainId?: number; councilId?: string };

type EligibilityMethod = "manual" | "gooddollar";

type VoterGroup = {
  id: number;
  name: string;
  eligibilityMethod: EligibilityMethod;
  defaultVotingPower: number;
  memberCount: number;
  members: string[];
};

type SubgraphVoter = {
  id: string;
  account: string;
  votingPower: string;
  ballot?: { votes?: { amount: string }[] };
};

const CELO_CHAIN_ID = 42220;

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
        ballot {
          votes {
            amount
          }
        }
      }
    }
  }
`;

function prettyEligibility(method: EligibilityMethod): string {
  return method === "gooddollar" ? "GoodDollar ID" : "Manual";
}

export default function Membership(props: MembershipProps) {
  const { chainId, councilId } = props;

  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [councilConfig, setCouncilConfig] = useState({
    limitMaxAllocation: false,
  });
  const [maxAllocation, setMaxAllocation] = useState("");

  const [groups, setGroups] = useState<VoterGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupEligibility, setNewGroupEligibility] =
    useState<EligibilityMethod>("manual");
  const [newGroupDefaultVotingPower, setNewGroupDefaultVotingPower] =
    useState("10");
  const [createGroupError, setCreateGroupError] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const q = useChunkedTxQueue(wagmiConfig, publicClient, councilId);

  const {
    data: flowCouncilQueryRes,
    loading: flowCouncilQueryResLoading,
    refetch,
    fetchMore,
  } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      chainId,
      councilId: councilId?.toLowerCase(),
    },
    skip: !councilId,
  });

  const councilMetadata = useCouncilMetadata(chainId ?? 0, councilId ?? "");
  const network = useMemo(
    () => networks.find((n) => n.id === chainId),
    [chainId],
  );
  const hasSplitter =
    isSplitterFactoryDeployed(network) &&
    !!councilMetadata.superappSplitterAddress;
  const isCelo = chainId === CELO_CHAIN_ID;

  const flowCouncil = flowCouncilQueryRes?.flowCouncil ?? null;

  const isManager = useMemo(() => {
    // Mirror the server's authorization (hasOnChainRole): voter manager,
    // recipient manager, or default admin can manage voter groups. Checking
    // only VOTER_MANAGER_ROLE left a council's default admin with a read-only
    // UI even though the API would accept their writes.
    const managerRoles = [
      VOTER_MANAGER_ROLE,
      RECIPIENT_MANAGER_ROLE,
      DEFAULT_ADMIN_ROLE,
    ];

    return !!flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() &&
        managerRoles.includes(m.role as `0x${string}`),
    );
  }, [address, flowCouncil]);

  // Only a council default admin can call updateManagers onchain, so the bot
  // role grant folded into "Create" is gated on this (a plain voter manager can
  // still create the group, just not grant the role here).
  const isAdmin = useMemo(
    () =>
      !!flowCouncil?.flowCouncilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === address?.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
      ),
    [address, flowCouncil],
  );

  const botAddress = process.env.NEXT_PUBLIC_FLOW_STATE_BOT_ADDRESS;

  const botHasVoterManagerRole = useMemo(() => {
    if (!botAddress) {
      return false;
    }

    const botLower = botAddress.toLowerCase();

    return !!flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === botLower && m.role === VOTER_MANAGER_ROLE,
    );
  }, [botAddress, flowCouncil]);

  // True when creating this group should also grant the Flow State bot the
  // Voter Manager role onchain (GoodDollar groups need it, the bot lacks it,
  // and the connected wallet is an admin able to grant it).
  const needsBotGrant =
    newGroupEligibility === "gooddollar" &&
    !!botAddress &&
    isAddress(botAddress) &&
    !botHasVoterManagerRole &&
    isAdmin;

  // Map of lowercased account -> subgraph voter for fast lookup in metrics.
  const votersByAccount = useMemo(() => {
    const map = new Map<string, SubgraphVoter>();

    for (const voter of (flowCouncil?.voters ?? []) as SubgraphVoter[]) {
      map.set(voter.account.toLowerCase(), voter);
    }

    return map;
  }, [flowCouncil]);

  // Total voting power assigned across every group's members (council-wide
  // denominator for each group's share). Uses subgraph votingPower so it
  // reflects the onchain reality, not the DB default.
  const totalCouncilAssigned = useMemo(() => {
    let total = 0;

    for (const group of groups) {
      for (const member of group.members) {
        const voter = votersByAccount.get(member.toLowerCase());

        if (voter) {
          total += Number(voter.votingPower);
        }
      }
    }

    return total;
  }, [groups, votersByAccount]);

  const fetchGroups = useCallback(async () => {
    if (!chainId || !councilId) {
      return;
    }

    try {
      setGroupsLoading(true);

      const res = await fetch(
        `/api/flow-council/voter-groups?chainId=${chainId}&councilId=${councilId}`,
      );
      const data = await res.json();

      if (data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGroupsLoading(false);
    }
  }, [chainId, councilId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (!flowCouncilQueryRes) {
      return;
    }

    fetchMore({
      variables: { skip: flowCouncilQueryRes.flowCouncil.voters.length },
    });
  }, [flowCouncilQueryRes, fetchMore]);

  useEffect(() => {
    if (!flowCouncil) {
      return;
    }

    if (flowCouncil.maxVotingSpread === 0) {
      setCouncilConfig((prev) => ({ ...prev, limitMaxAllocation: false }));
    } else {
      setCouncilConfig((prev) => ({ ...prev, limitMaxAllocation: true }));
      setMaxAllocation(String(flowCouncil.maxVotingSpread));
    }
  }, [flowCouncil]);

  const hasMaxSpreadChange = useMemo(() => {
    if (!flowCouncil) {
      return false;
    }

    const nextSpread = councilConfig.limitMaxAllocation
      ? Number(maxAllocation)
      : 0;

    return nextSpread !== flowCouncil.maxVotingSpread;
  }, [councilConfig, maxAllocation, flowCouncil]);

  // The overview Submit now only updates the council-wide Max Voting Spread.
  // It mirrors the existing updateVoters writeContract shape with an empty
  // voters array so no per-voter allocation changes here. (Task 6)
  const handleSubmit = async () => {
    if (!address || !publicClient || !councilId) {
      return;
    }

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const hash = await writeContract(wagmiConfig, {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateVoters",
        args: [
          [],
          councilConfig.limitMaxAllocation ? Number(maxAllocation) : 0,
        ],
      });

      await waitForReceipt(publicClient, hash);

      setTransactionSuccess(true);
      setIsTransactionLoading(false);

      await refetch();
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  const resetNewGroupModal = () => {
    setNewGroupName("");
    setNewGroupEligibility("manual");
    setNewGroupDefaultVotingPower("10");
    setCreateGroupError("");
  };

  const handleCreateGroup = async () => {
    if (!chainId || !councilId) {
      return;
    }

    const name = newGroupName.trim();
    const isGoodDollar = newGroupEligibility === "gooddollar";
    // Manual groups don't expose the field; they fall back to the default of 10
    // (the per-voter fallback used by the Add voters modal). Only the GoodDollar
    // value is user-editable, so only that one is validated.
    const defaultVotingPower = isGoodDollar
      ? Number(newGroupDefaultVotingPower)
      : 10;

    if (!name) {
      setCreateGroupError("Name is required");
      return;
    }

    if (
      isGoodDollar &&
      (!isNumber(newGroupDefaultVotingPower) ||
        newGroupDefaultVotingPower.includes(".") ||
        defaultVotingPower < 1 ||
        defaultVotingPower > 1e6)
    ) {
      setCreateGroupError("Default votes must be an integer between 1 and 1M");
      return;
    }

    try {
      setIsCreatingGroup(true);
      setCreateGroupError("");

      // Grant the bot the Voter Manager role onchain first. Doing it before the
      // DB write means a rejected wallet prompt aborts cleanly without leaving
      // an orphan group (a retry would otherwise create a duplicate).
      if (needsBotGrant) {
        if (!publicClient) {
          setCreateGroupError("Wallet not ready");
          return;
        }

        const hash = await writeContract(wagmiConfig, {
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "updateManagers",
          // status 0 = Status.ADDED (mirrors the Permissions page).
          args: [
            [
              {
                account: botAddress as Address,
                role: VOTER_MANAGER_ROLE,
                status: 0,
              },
            ],
          ],
        });

        await waitForReceipt(publicClient, hash);
        await refetch();
      }

      const res = await fetch("/api/flow-council/voter-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          councilId,
          name,
          eligibilityMethod: newGroupEligibility,
          defaultVotingPower,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setCreateGroupError(data.error ?? "Failed to create group");
        return;
      }

      setShowNewGroupModal(false);
      resetNewGroupModal();
      await fetchGroups();
    } catch (err) {
      console.error(err);
      setCreateGroupError(
        needsBotGrant
          ? "Failed to grant the bot role. Please try again."
          : "Failed to create group",
      );
    } finally {
      setIsCreatingGroup(false);
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

  const showResumeBanner =
    q.totalCount > 0 &&
    q.completedCount < q.totalCount &&
    q.councilId === councilId;

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        {showResumeBanner ? (
          <Alert
            variant="warning"
            className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 mb-0"
          >
            <span className="fw-semi-bold">
              You have an in-progress operation for this council (
              {q.completedCount} of {q.totalCount} transactions submitted).
            </span>
            <Stack direction="horizontal" gap={2}>
              <Button
                size="sm"
                className="fw-semi-bold"
                onClick={() => q.resume()}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                className="fw-semi-bold"
                onClick={() => q.clear()}
              >
                Discard
              </Button>
            </Stack>
          </Alert>
        ) : null}
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
              className="justify-content-between align-items-center mt-5 mb-3"
            >
              <Card.Title className="fs-6 fw-semi-bold mb-0">
                Voter Groups
              </Card.Title>
              <Button
                disabled={!isManager}
                className="fw-semi-bold rounded-4 px-4 py-2"
                onClick={() => {
                  resetNewGroupModal();
                  setShowNewGroupModal(true);
                }}
              >
                New group
              </Button>
            </Stack>

            {groupsLoading ? (
              <Stack
                direction="horizontal"
                className="justify-content-center py-5"
              >
                <Spinner />
              </Stack>
            ) : groups.length === 0 ? (
              <Card.Text className="text-info py-4 text-center mb-0">
                No voter groups yet.
              </Card.Text>
            ) : (
              <Table responsive hover className="bg-white rounded-4 mb-0">
                <thead>
                  <tr>
                    <th className="fw-semi-bold">Group</th>
                    <th className="fw-semi-bold">Eligibility</th>
                    <th className="fw-semi-bold text-end">Voters</th>
                    <th className="fw-semi-bold text-end">
                      Valid votes assigned
                    </th>
                    <th className="fw-semi-bold text-end">Votes used</th>
                    <th className="fw-semi-bold text-end">Share of votes</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const memberVoters = group.members
                      .map((member) =>
                        votersByAccount.get(member.toLowerCase()),
                      )
                      .filter((voter): voter is SubgraphVoter => !!voter);

                    const assigned = memberVoters.reduce(
                      (sum, voter) => sum + Number(voter.votingPower),
                      0,
                    );
                    const used = memberVoters.reduce(
                      (sum, voter) => sum + computeCastVotes(voter),
                      0,
                    );
                    const usedPct = assigned > 0 ? (used / assigned) * 100 : 0;
                    const share = shareOfVotes(assigned, totalCouncilAssigned);

                    return (
                      <tr key={group.id}>
                        <td>
                          <Link
                            href={`/flow-councils/membership/${chainId}/${councilId}/${group.id}`}
                            className="text-primary text-decoration-none fw-semi-bold"
                          >
                            {group.name}
                          </Link>
                        </td>
                        <td>{prettyEligibility(group.eligibilityMethod)}</td>
                        <td className="text-end">{group.memberCount}</td>
                        <td className="text-end">{assigned}</td>
                        <td className="text-end">
                          {used} ({usedPct.toFixed(0)}%)
                        </td>
                        <td className="text-end">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-6 mb-30">
          <Button
            disabled={!isManager || !hasMaxSpreadChange}
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
            disabled={councilMetadata.isPending}
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() => {
              router.push(
                hasSplitter
                  ? `/flow-councils/funding/${chainId}/${councilId}`
                  : `/flow-councils/communications/${chainId}/${councilId}`,
              );
            }}
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

      <Modal
        show={showNewGroupModal}
        centered
        onHide={() => setShowNewGroupModal(false)}
      >
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">New group</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <Form.Group className="mb-3">
            <Form.Label className="fw-semi-bold">Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Group name"
              value={newGroupName}
              maxLength={100}
              disabled={isCreatingGroup}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semi-bold">Eligibility method</Form.Label>
            <Form.Select
              value={newGroupEligibility}
              disabled={isCreatingGroup}
              onChange={(e) =>
                setNewGroupEligibility(e.target.value as EligibilityMethod)
              }
            >
              <option value="manual">Manual</option>
              <option value="gooddollar" disabled={!isCelo}>
                GoodDollar ID{!isCelo ? " (Celo only)" : ""}
              </option>
            </Form.Select>
          </Form.Group>
          {newGroupEligibility === "gooddollar" ? (
            <Form.Group className="mb-3">
              <Form.Label className="fw-semi-bold">
                Default vote allocation
              </Form.Label>
              <Form.Control
                type="text"
                inputMode="numeric"
                placeholder="10"
                value={newGroupDefaultVotingPower}
                disabled={isCreatingGroup}
                onChange={(e) => {
                  const value = e.target.value;

                  // Digits only (matches the group-detail editor) so negatives
                  // and exponents can't be typed; the server still validates.
                  if (
                    value === "" ||
                    (/^\d+$/.test(value) && Number(value) <= 1e6)
                  ) {
                    setNewGroupDefaultVotingPower(value);
                  }
                }}
              />
              <Form.Text className="text-info">
                Votes a voter receives when first added through this group.
              </Form.Text>
            </Form.Group>
          ) : null}
          {newGroupEligibility === "gooddollar" ? (
            botHasVoterManagerRole ? (
              <Alert variant="success" className="mb-0">
                The Flow State bot already holds the Voter Manager role on this
                council.
              </Alert>
            ) : (
              <Alert variant="info" className="mb-0">
                The Flow State bot needs the Voter Manager role on this council
                to add GoodDollar-verified voters.
                {botAddress ? (
                  <>
                    <br />
                    Bot address:{" "}
                    <span className="text-break">{botAddress}</span>
                  </>
                ) : null}
                <br />
                {needsBotGrant
                  ? "Creating this group will prompt you to grant it."
                  : "A council admin must grant it from the Permissions page."}
              </Alert>
            )
          ) : null}
          {createGroupError ? (
            <Alert variant="danger" className="mt-3 mb-0">
              {createGroupError}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setShowNewGroupModal(false)}
            disabled={isCreatingGroup}
          >
            Cancel
          </Button>
          <Button
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => {
              if (needsBotGrant && connectedChain?.id !== chainId) {
                switchChain({ chainId });
              } else {
                handleCreateGroup();
              }
            }}
            disabled={!isManager || isCreatingGroup}
          >
            {isCreatingGroup ? (
              <Spinner size="sm" />
            ) : needsBotGrant && connectedChain?.id !== chainId ? (
              "Switch Network"
            ) : (
              "Create"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
