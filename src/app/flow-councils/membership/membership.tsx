"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address } from "viem";
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
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import useCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import { fetchVoterGroups } from "@/app/flow-councils/lib/fetchVoterGroups";
import { useGrantBotVoterManager } from "@/app/flow-councils/hooks/useGrantBotVoterManager";
import {
  computeCastVotes,
  shareOfVotes,
  validateVotePowerInput,
} from "@/app/flow-councils/lib/voterUtils";
import SuccessCheckmark from "@/app/flow-councils/components/SuccessCheckmark";
import {
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  DEFAULT_ADMIN_ROLE,
  FLOW_STATE_BOT_ADDRESS,
  CELO_CHAIN_ID,
} from "../lib/constants";
import type {
  EligibilityMethod,
  SubgraphVoter,
  VoterGroup,
} from "./voterTableTypes";
import { prettyEligibility } from "./voterTableTypes";

type MembershipProps = { chainId?: number; councilId?: string };

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
  const [createGroupSuccess, setCreateGroupSuccess] = useState(false);
  // After a successful DB create, the new group's id is held so a retry that
  // failed at the on-chain step skips re-creating the group and just finishes
  // the transaction.
  const [createdGroupId, setCreatedGroupId] = useState<number | null>(null);
  // Tracks the post-create-success close timer so it's cleared if the component
  // unmounts before it fires (avoids setState on an unmounted component).
  const createSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  useEffect(
    () => () => {
      if (createSuccessTimer.current) {
        clearTimeout(createSuccessTimer.current);
      }
    },
    [],
  );

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

  // Only a council default admin can call updateManagers onchain, so the
  // "Add Permissions" bot-role grant is gated on this (a plain voter manager can
  // still create the group, just not grant the role here).
  const isAdmin = useMemo(
    () =>
      !!flowCouncil?.flowCouncilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === address?.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
      ),
    [address, flowCouncil],
  );

  const botHasVoterManagerRole = useMemo(() => {
    const botLower = FLOW_STATE_BOT_ADDRESS.toLowerCase();

    return !!flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === botLower && m.role === VOTER_MANAGER_ROLE,
    );
  }, [flowCouncil]);

  const {
    grant,
    isGranting,
    error: grantError,
  } = useGrantBotVoterManager(councilId ?? "");

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

    setGroupsLoading(true);

    const result = await fetchVoterGroups(chainId, councilId);

    if (result) {
      setGroups(result);
    }

    setGroupsLoading(false);
  }, [chainId, councilId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const refresh = useCallback(async () => {
    await refetch();
    await fetchGroups();
  }, [refetch, fetchGroups]);

  // The query pages 1000 voters per request (`first: 1000` above). Fetch the
  // next page only while the loaded count is a full multiple of that page size:
  // a full last page means there may be more, a partial/empty page means we've
  // reached the end and stops the recursion (also avoiding a redundant trailing
  // request). This loads every voter for councils larger than one page.
  useEffect(() => {
    const voters = flowCouncilQueryRes?.flowCouncil?.voters;

    if (!voters) {
      return;
    }

    const loaded = voters.length;

    if (loaded > 0 && loaded % 1000 === 0) {
      fetchMore({ variables: { skip: loaded } });
    }
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
    setCreateGroupSuccess(false);
    setCreatedGroupId(null);
  };

  const handleCreateGroup = async () => {
    if (!chainId || !councilId) {
      return;
    }

    const name = newGroupName.trim();
    const isGoodDollar = newGroupEligibility === "gooddollar";
    const isMetrics = newGroupEligibility === "metrics";
    // Manual groups don't expose the field; they fall back to the default of 10
    // (the per-voter fallback used by the Add voters modal). GoodDollar's default
    // allocation and the metrics bot's vote power are user-editable, so those are
    // validated.
    const usesVotePower = isGoodDollar || isMetrics;
    const defaultVotingPower = usesVotePower
      ? Number(newGroupDefaultVotingPower)
      : 10;

    if (!name) {
      setCreateGroupError("Name is required");
      return;
    }

    if (usesVotePower) {
      const votePowerError = validateVotePowerInput(
        newGroupDefaultVotingPower,
        isMetrics,
      );

      if (votePowerError) {
        setCreateGroupError(votePowerError);
        return;
      }
    }

    if (isMetrics && !publicClient) {
      setCreateGroupError("Connect your wallet to create a metrics group.");
      return;
    }

    setIsCreatingGroup(true);
    setCreateGroupError("");

    let onChainApplied = false;
    let newGroupId = createdGroupId;

    try {
      // GoodDollar and NFT groups rely on the Flow State bot holding
      // VOTER_MANAGER_ROLE to auto-add self-claiming voters. Grant it as part of
      // creation so a group can't exist without the permissions that make it
      // work. Skipped when the bot already holds the role for this council.
      if (automatedNeedsGrant) {
        if (connectedChain?.id !== chainId) {
          switchChain({ chainId });
          setCreateGroupError(
            "Switch your wallet to the council's network, then click Create again.",
          );
          return;
        }

        const granted = await grant();

        if (!granted) {
          return;
        }

        // Await so botHasVoterManagerRole reflects the just-granted role before
        // the POST/modal close (matches GroupDetail's handleAddPermissions).
        await refetch();
      }

      // Metrics groups add the Flow State bot as a council voter on-chain. Check
      // the wallet is on the right network before creating anything off-chain,
      // so a wrong-network bail can't leave a DB group without its bot.
      if (isMetrics && publicClient && connectedChain?.id !== chainId) {
        switchChain({ chainId });
        setCreateGroupError(
          "Switch your wallet to the council's network, then click Create again.",
        );
        return;
      }

      // The bot's on-chain vote power is the partial/complete signal: 0 means it
      // was never added (a genuine partial attempt), non-zero means a fully
      // configured metrics group already exists. Read it once here so it can
      // both gate resume-vs-reject below and pick addVoter vs editVoter.
      let botVotingPower = 0n;
      if (isMetrics && publicClient) {
        const botVoter = await publicClient.readContract({
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "getVoter",
          args: [FLOW_STATE_BOT_ADDRESS],
        });
        botVotingPower = botVoter.votingPower;
      }

      // Create the DB group first. The server's "one metrics group per council"
      // and duplicate-name guards run here, before any on-chain write, so a
      // rejected create can never orphan a bot voter on-chain. On a retry the id
      // is reused so we skip straight to the on-chain step.
      if (newGroupId === null) {
        // A prior attempt may have created the DB group before its on-chain tx
        // failed; if the modal was closed since, createdGroupId is gone. Reuse
        // the existing metrics group so the retry resumes from the on-chain step
        // instead of hitting the partial unique index with a second insert. Only
        // adopt it when the bot isn't on-chain yet (power 0); if the bot already
        // has vote power the group is complete, so reject like the server's
        // one-metrics-group-per-council guard rather than silently re-editing it.
        if (isMetrics) {
          const existingGroups = await fetchVoterGroups(chainId, councilId);
          const existingMetrics = existingGroups?.find(
            (group) => group.eligibilityMethod === "metrics",
          );

          if (existingMetrics) {
            if (botVotingPower !== 0n) {
              setCreateGroupError("This council already has a metrics group.");
              return;
            }

            newGroupId = existingMetrics.id;
            setCreatedGroupId(newGroupId);
          }
        }
      }

      if (newGroupId === null) {
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

        newGroupId = data.id as number;
        setCreatedGroupId(newGroupId);
      }

      // Add the bot as a council voter with the configured vote power. It needs
      // no role (unlike GoodDollar), it only casts ballots, so an admin with
      // voter-manager rights signs addVoter directly. editVoter covers the rare
      // case where the bot is already a voter (a recreated metrics group).
      if (isMetrics && publicClient) {
        const hash = await writeContract(wagmiConfig, {
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: botVotingPower === 0n ? "addVoter" : "editVoter",
          args: [FLOW_STATE_BOT_ADDRESS, BigInt(defaultVotingPower)],
        });

        await waitForReceipt(publicClient, hash);
        onChainApplied = true;
      }

      // Record the bot's group membership so it appears in the metrics group's
      // voter list. Best-effort and cosmetic: the ballot API reads the bot's
      // power on-chain, not from this row, so a failure here doesn't block
      // creation.
      if (isMetrics && newGroupId) {
        await fetch("/api/flow-council/voter-groups/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            councilId,
            groupId: newGroupId,
            address: FLOW_STATE_BOT_ADDRESS,
          }),
        }).catch(() => {});
      }

      // Platform-standard confirmation: the button turns green with a checkmark,
      // then the modal closes. The form/success state is reset in the modal's
      // onExited handler so the button never flashes back to "Create" while the
      // modal is still animating closed.
      setCreateGroupSuccess(true);

      createSuccessTimer.current = setTimeout(() => {
        setShowNewGroupModal(false);
        refresh();
      }, 1500);
    } catch (err) {
      console.error(err);
      setCreateGroupError(
        isMetrics && newGroupId !== null && !onChainApplied
          ? "The group was saved, but adding the bot on-chain failed. Click Create again to finish."
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

  // Granting the bot role is a DEFAULT_ADMIN-only onchain call, so a non-admin
  // manager can't complete a create that still needs the grant. Both automated
  // self-claim methods need the bot to hold VOTER_MANAGER_ROLE.
  const automatedNeedsGrant =
    (newGroupEligibility === "gooddollar" || newGroupEligibility === "nft") &&
    !botHasVoterManagerRole;
  const grantBlockedForNonAdmin = automatedNeedsGrant && !isAdmin;
  const newGroupUsesVotePower =
    newGroupEligibility === "gooddollar" ||
    newGroupEligibility === "metrics" ||
    newGroupEligibility === "nft";
  const hasMetricsGroup = groups.some(
    (group) => group.eligibilityMethod === "metrics",
  );
  const hasGoodDollarGroup = groups.some(
    (group) => group.eligibilityMethod === "gooddollar",
  );
  const hasNftGroup = groups.some((group) => group.eligibilityMethod === "nft");

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
                : "(Read only. Check your connected wallet's permissions to make changes.)"}
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
                    <th className="fw-semi-bold text-end">Votes assigned</th>
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

                    // A metrics group's assignment is the bot's on-chain voting
                    // power, mirrored to defaultVotingPower when the group is
                    // created. Read it from there (as the group detail page
                    // does) so the value is correct before the subgraph has
                    // indexed the bot, instead of showing 0.
                    const assigned =
                      group.eligibilityMethod === "metrics"
                        ? group.defaultVotingPower
                        : memberVoters.reduce(
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
              router.push(`/flow-councils/funding/${chainId}/${councilId}`);
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
        onExited={resetNewGroupModal}
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
              <option value="gooddollar" disabled={!isCelo || hasNftGroup}>
                GoodDollar ID
                {!isCelo
                  ? " (Celo only)"
                  : hasNftGroup
                    ? " (n/a - this council uses NFT eligibility)"
                    : ""}
              </option>
              <option value="metrics" disabled={hasMetricsGroup}>
                {hasMetricsGroup
                  ? "Metrics (n/a - one metrics voter per council)"
                  : "Metrics"}
              </option>
              <option value="nft" disabled={hasGoodDollarGroup}>
                {hasGoodDollarGroup
                  ? "NFT Holder (n/a - this council uses GoodDollar eligibility)"
                  : "NFT Holder"}
              </option>
            </Form.Select>
          </Form.Group>
          {newGroupEligibility === "nft" && hasGoodDollarGroup ? (
            <Alert variant="warning" className="mb-3">
              This council uses GoodDollar eligibility. A council uses one
              automated method or the other.
            </Alert>
          ) : null}
          {newGroupEligibility === "gooddollar" && hasNftGroup ? (
            <Alert variant="warning" className="mb-3">
              This council uses NFT eligibility. A council uses one automated
              method or the other.
            </Alert>
          ) : null}
          {newGroupUsesVotePower ? (
            <Form.Group className="mb-3">
              <Form.Label className="fw-semi-bold">
                {newGroupEligibility === "metrics"
                  ? "Vote power"
                  : "Default vote allocation"}
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
                {newGroupEligibility === "metrics"
                  ? "Total votes the metrics bot can allocate across recipients."
                  : "Votes a voter receives when first added through this group."}
              </Form.Text>
            </Form.Group>
          ) : null}
          {newGroupEligibility === "metrics" ? (
            <Alert variant="info" className="mb-3">
              Creating this group adds a Flow State-sponsored bot as a council
              voter with the vote power above (one transaction). You can then
              mint an API key on the group page to submit ballots
              programmatically.
            </Alert>
          ) : null}
          {newGroupEligibility === "gooddollar" ||
          newGroupEligibility === "nft" ? (
            <Alert variant="info" className="mb-3">
              Automated eligibility is managed by a Flow State-sponsored bot.{" "}
              {automatedNeedsGrant
                ? "Creating this group will trigger a transaction to grant the necessary voter management permissions."
                : "It already holds the voter management permissions it needs for this council."}
            </Alert>
          ) : null}
          {grantBlockedForNonAdmin ? (
            <Alert variant="warning" className="mb-3">
              Only a council admin can grant these permissions. Ask a council
              admin to create this group.
            </Alert>
          ) : null}
          {newGroupEligibility === "gooddollar" && grantError ? (
            <Alert variant="danger" className="mb-3">
              {grantError}
            </Alert>
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
            disabled={isCreatingGroup || createGroupSuccess}
          >
            Cancel
          </Button>
          <Button
            variant={createGroupSuccess ? "success" : "primary"}
            className="rounded-4 px-4 py-2 fw-semi-bold"
            style={{ pointerEvents: createGroupSuccess ? "none" : "auto" }}
            onClick={handleCreateGroup}
            disabled={
              !isManager ||
              isCreatingGroup ||
              isGranting ||
              createGroupSuccess ||
              grantBlockedForNonAdmin
            }
          >
            {createGroupSuccess ? (
              <SuccessCheckmark />
            ) : isCreatingGroup || isGranting ? (
              <Spinner size="sm" />
            ) : (
              "Create"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
