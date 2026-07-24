"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { Address } from "viem";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Modal from "react-bootstrap/Modal";
import Image from "react-bootstrap/Image";
import InfoTooltip from "@/components/InfoTooltip";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { waitForReceipt, truncateAddress } from "@/lib/utils";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { useChunkedTxQueue } from "@/app/flow-councils/hooks/useChunkedTxQueue";
import { useVoterGroupQueueCleanup } from "@/app/flow-councils/hooks/useVoterGroupQueueCleanup";
import { fetchVoterGroups } from "@/app/flow-councils/lib/fetchVoterGroups";
import { useGrantBotVoterManager } from "@/app/flow-councils/hooks/useGrantBotVoterManager";
import {
  computeCastVotes,
  shareOfVotes,
  validateVotePowerInput,
} from "@/app/flow-councils/lib/voterUtils";
import { networks } from "@/lib/networks";
import VoterTable from "./VoterTable";
import EligibilityManagerField from "./EligibilityManagerField";
import MetricsApiKeysPanel from "./MetricsApiKeysPanel";
import MetricsIntegrationPanel from "./MetricsIntegrationPanel";
import type {
  ChunkedQueue,
  EligibilityMethod,
  SubgraphVoter,
  VoterGroup,
  VoterGroupQueueMeta,
} from "./voterTableTypes";
import { prettyEligibility } from "./voterTableTypes";
import NftGroupFields, {
  emptyNftDraft,
  nftDraftToConfig,
  nftDraftFromGroup,
  isNftDraftComplete,
  type NftConfigDraft,
} from "./NftGroupFields";
import {
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  DEFAULT_ADMIN_ROLE,
  FLOW_STATE_BOT_ADDRESS,
  CELO_CHAIN_ID,
} from "../lib/constants";

type GroupDetailProps = {
  chainId: number;
  councilId: string;
  groupId: number;
};

// Group detail needs the same voter list (for metrics) plus the managers list
// (for isManager) the overview uses, so it runs the same query.
const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilGroupDetailQuery($councilId: String!, $skip: Int = 0) {
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

export default function GroupDetail(props: GroupDetailProps) {
  const { chainId, councilId, groupId } = props;

  const [groups, setGroups] = useState<VoterGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [editName, setEditName] = useState("");
  const [editEligibility, setEditEligibility] =
    useState<EligibilityMethod>("manual");
  const [editDefaultVotingPower, setEditDefaultVotingPower] = useState("10");
  const [editNftDraft, setEditNftDraft] =
    useState<NftConfigDraft>(emptyNftDraft);
  const [editNftBlocked, setEditNftBlocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const q = useChunkedTxQueue(wagmiConfig, publicClient, councilId);

  const isCelo = chainId === CELO_CHAIN_ID;
  const network = networks.find((n) => n.id === chainId);

  const {
    data: flowCouncilQueryRes,
    fetchMore,
    refetch,
  } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: { councilId: councilId.toLowerCase() },
    skip: !councilId,
  });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil ?? null;
  const maxVotingSpread = flowCouncil?.maxVotingSpread ?? 0;

  const isManager = useMemo(() => {
    // Mirror the server's authorization (hasOnChainRole): voter manager,
    // recipient manager, or default admin can manage voter groups.
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
  // "Add Permissions" bot-role grant is gated on this.
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
  } = useGrantBotVoterManager(councilId);

  const handleAddPermissions = async () => {
    if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
      return;
    }

    const ok = await grant();

    if (ok) {
      await refetch();
    }
  };

  const votersByAccount = useMemo(() => {
    const map = new Map<string, SubgraphVoter>();

    for (const voter of (flowCouncil?.voters ?? []) as SubgraphVoter[]) {
      map.set(voter.account.toLowerCase(), voter);
    }

    return map;
  }, [flowCouncil]);

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

  const group = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  // Subgraph voters that belong to this group, in member order.
  const groupVoters = useMemo<SubgraphVoter[]>(() => {
    if (!group) {
      return [];
    }

    return group.members
      .map((member) => votersByAccount.get(member.toLowerCase()))
      .filter((voter): voter is SubgraphVoter => !!voter);
  }, [group, votersByAccount]);

  // Lowercased accounts already onchain with a non-zero allocation, the add
  // flow skips these so it never re-adds an existing voter.
  const existingOnchainAccounts = useMemo<string[]>(() => {
    const accounts: string[] = [];

    for (const voter of (flowCouncil?.voters ?? []) as SubgraphVoter[]) {
      if (voter.votingPower !== "0") {
        accounts.push(voter.account.toLowerCase());
      }
    }

    return accounts;
  }, [flowCouncil]);

  // Group dropdown targets for the table's "Move to group…" action.
  const groupOptions = useMemo(
    () => groups.map((g) => ({ id: g.id, name: g.name })),
    [groups],
  );

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

  // Re-pull both the subgraph voters and the DB groups. Children call this after
  // offchain changes; the cleanup hook also calls it once when the onchain queue
  // finishes.
  const refresh = useCallback(async () => {
    await refetch();
    await fetchGroups();
  }, [refetch, fetchGroups]);

  // Finalize-on-complete (drop removed voters' DB rows) and discard-with-rollback
  // are driven by the queue's persisted meta, so they survive a remount and work
  // from either page that mounts the queue.
  const { discard, cleanupError, clearCleanupError } =
    useVoterGroupQueueCleanup(q, refresh);

  // Capture the hook's stable startQueue reference so the wrapper below depends
  // on it directly instead of the render-fresh `q` object.
  const queueStart = q.startQueue;

  // Clear any stale cleanup error when a new operation begins; the meta is
  // forwarded verbatim so the cleanup hook can act on it later.
  const startQueue = useCallback(
    (
      cid: string,
      chunks: { args: Record<string, unknown> }[],
      meta?: VoterGroupQueueMeta,
    ) => {
      clearCleanupError();
      queueStart(cid, chunks, meta);
    },
    [queueStart, clearCleanupError],
  );

  // Stabilized on the queue's individual fields rather than the hook's
  // render-fresh object, so children (VoterTable) only re-render when queue
  // state they actually read changes. `clear` is the rollback-aware discard.
  const qForChildren = useMemo<ChunkedQueue>(
    () => ({
      startQueue,
      resume: q.resume,
      clear: discard,
      isPending: q.isPending,
      completedCount: q.completedCount,
      totalCount: q.totalCount,
      error: q.error,
    }),
    [
      startQueue,
      q.resume,
      discard,
      q.isPending,
      q.completedCount,
      q.totalCount,
      q.error,
    ],
  );

  // The query pages 1000 voters per request (`first: 1000` above). Fetch the
  // next page only while the loaded count is a full multiple of that page size:
  // a full last page means there may be more, a partial/empty page means we've
  // reached the end and stops the recursion (also avoiding a redundant trailing
  // request). This loads every voter for councils larger than one page.
  useEffect(() => {
    if (!flowCouncilQueryRes) {
      return;
    }

    const loaded = flowCouncilQueryRes.flowCouncil.voters.length;

    if (loaded > 0 && loaded % 1000 === 0) {
      fetchMore({ variables: { skip: loaded } });
    }
  }, [flowCouncilQueryRes, fetchMore]);

  // Seed the editable form from the loaded group. Skipped while editing so a
  // background refresh (e.g. after a voter change) can't clobber unsaved edits.
  useEffect(() => {
    if (!group || isEditing) {
      return;
    }

    setEditName(group.name);
    setEditEligibility(group.eligibilityMethod);
    setEditDefaultVotingPower(String(group.defaultVotingPower));
    setEditNftDraft(nftDraftFromGroup(group));
    setEditNftBlocked(false);
  }, [group, isEditing]);

  const metrics = useMemo(() => {
    if (!group) {
      return { assigned: 0, used: 0, usedPct: 0, share: 0 };
    }

    const memberVoters = group.members
      .map((member) => votersByAccount.get(member.toLowerCase()))
      .filter((voter): voter is SubgraphVoter => !!voter);

    // A metrics group's assignment is the bot's on-chain voting power, which is
    // written on-chain (addVoter/editVoter) and mirrored to defaultVotingPower.
    // Read it from there rather than the subgraph so the number is correct
    // immediately, before the subgraph has indexed the new voter.
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

    return { assigned, used, usedPct, share };
  }, [group, votersByAccount, totalCouncilAssigned]);

  const enterEditMode = () => {
    if (!group) {
      return;
    }

    setEditName(group.name);
    setEditEligibility(group.eligibilityMethod);
    setEditDefaultVotingPower(String(group.defaultVotingPower));
    setEditNftDraft(nftDraftFromGroup(group));
    setEditNftBlocked(false);
    setSaveError("");
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    if (group) {
      setEditName(group.name);
      setEditEligibility(group.eligibilityMethod);
      setEditDefaultVotingPower(String(group.defaultVotingPower));
      setEditNftDraft(nftDraftFromGroup(group));
      setEditNftBlocked(false);
    }

    setSaveError("");
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!group) {
      return;
    }

    const name = editName.trim();
    const isGoodDollar = editEligibility === "gooddollar";
    const isMetrics = editEligibility === "metrics";
    const isNft = editEligibility === "nft";
    const usesVotePower = isGoodDollar || isMetrics || isNft;
    const defaultVotingPower = Number(editDefaultVotingPower);

    if (!name) {
      setSaveError("Name is required");
      return;
    }

    if (usesVotePower) {
      const votePowerError = validateVotePowerInput(
        editDefaultVotingPower,
        isMetrics,
      );

      if (votePowerError) {
        setSaveError(votePowerError);
        return;
      }
    }

    // A metrics group's vote power must be written on-chain (the bot is the
    // single voter), so refuse the change rather than letting the DB drift from
    // the bot's actual on-chain power when no wallet client is available.
    if (
      isMetrics &&
      defaultVotingPower !== group.defaultVotingPower &&
      !publicClient
    ) {
      setSaveError(
        "Connect your wallet to change a metrics group's vote power.",
      );
      return;
    }

    let onChainApplied = false;
    const onChainSaveFailed =
      "Vote power was updated on-chain, but saving failed. Click Save again to finish.";

    try {
      setIsSaving(true);
      setSaveError("");
      setSaveSuccess(false);

      // A metrics group's vote power IS the bot's on-chain voting power (it is
      // the single voter), so a change must be written on-chain, unlike
      // GoodDollar, where defaultVotingPower only seeds future voters.
      if (
        isMetrics &&
        publicClient &&
        defaultVotingPower !== group.defaultVotingPower
      ) {
        if (connectedChain?.id !== chainId) {
          switchChain({ chainId });
          setSaveError(
            "Switch your wallet to the council's network, then click Save again.",
          );
          return;
        }

        // Idempotent retry: if a prior attempt wrote the new power on-chain but
        // the server PATCH failed, the bot already holds the target power.
        // Re-running editVoter would fire a redundant tx, so read the current
        // power first and skip the write when it already matches (mirrors the
        // create/delete getVoter check).
        const botVoter = await publicClient.readContract({
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "getVoter",
          args: [FLOW_STATE_BOT_ADDRESS],
        });

        if (botVoter.votingPower !== BigInt(defaultVotingPower)) {
          const hash = await writeContract(wagmiConfig, {
            address: councilId as Address,
            abi: flowCouncilAbi,
            functionName: "editVoter",
            args: [FLOW_STATE_BOT_ADDRESS, BigInt(defaultVotingPower)],
          });

          await waitForReceipt(publicClient, hash);
        }

        onChainApplied = true;
      }

      const res = await fetch(`/api/flow-council/voter-groups?id=${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          councilId,
          name,
          // Only send the method when it actually changed. Re-asserting it on a
          // name-only edit needlessly re-runs the server's uniqueness check and
          // keeps a latent path for switching a locked metrics group's method.
          ...(editEligibility !== group.eligibilityMethod
            ? { eligibilityMethod: editEligibility }
            : {}),
          ...(usesVotePower ? { defaultVotingPower } : {}),
          ...(editEligibility === "nft"
            ? { nftConfig: nftDraftToConfig(editNftDraft) }
            : {}),
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setSaveError(
          onChainApplied
            ? onChainSaveFailed
            : (data.error ?? "Failed to save group"),
        );
        return;
      }

      setSaveSuccess(true);
      setIsEditing(false);
      await fetchGroups();
    } catch (err) {
      console.error(err);
      setSaveError(onChainApplied ? onChainSaveFailed : "Failed to save group");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!group) {
      return;
    }

    const isMetrics = group.eligibilityMethod === "metrics";
    let onChainApplied = false;
    const onChainDeleteFailed =
      "The voter was removed on-chain, but deleting the group failed. Click Delete again to finish.";

    try {
      setIsDeleting(true);
      setDeleteError("");

      // A metrics group owns the single bot voter. Remove it on-chain first (the
      // server then clears the membership row and the group), so the admin
      // deletes the group without a separate "remove voter" step. Removal goes
      // through updateVoters with power 0 (which the contract routes to
      // removeVoter) to match the rest of the app, preserving the council-wide
      // maxVotingSpread (read fresh on-chain below) so it is never reset.
      // editVoter can't be used here: the contract reverts INVALID on a 0
      // voting power.
      if (isMetrics) {
        if (!publicClient) {
          setDeleteError("Connect your wallet to delete a metrics group.");
          setIsDeleting(false);
          return;
        }

        if (connectedChain?.id !== chainId) {
          switchChain({ chainId });
          setDeleteError(
            "Switch your wallet to the council's network, then click Delete again.",
          );
          setIsDeleting(false);
          return;
        }

        // Idempotent retry: if a prior attempt removed the voter on-chain but
        // the server DELETE failed, the bot is already at 0 power. Re-running
        // updateVoters against a removed voter can revert, so skip straight to
        // the server delete (mirrors the create flow's getVoter check).
        const botVoter = await publicClient.readContract({
          address: councilId as Address,
          abi: flowCouncilAbi,
          functionName: "getVoter",
          args: [FLOW_STATE_BOT_ADDRESS],
        });

        if (botVoter.votingPower !== 0n) {
          // updateVoters writes maxVotingSpread council-wide, so read it fresh
          // on-chain rather than reusing the subgraph value, which can be stale
          // if another admin changed the spread since this page loaded (passing
          // the stale value would silently revert their change).
          const onChainSpread = await publicClient.readContract({
            address: councilId as Address,
            abi: flowCouncilAbi,
            functionName: "maxVotingSpread",
          });

          const hash = await writeContract(wagmiConfig, {
            address: councilId as Address,
            abi: flowCouncilAbi,
            functionName: "updateVoters",
            args: [
              [
                {
                  account: FLOW_STATE_BOT_ADDRESS,
                  votingPower: 0n,
                  votes: [],
                },
              ],
              onChainSpread,
            ],
          });

          await waitForReceipt(publicClient, hash);
        }

        onChainApplied = true;
      }

      const res = await fetch(`/api/flow-council/voter-groups?id=${group.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, councilId }),
      });
      const data = await res.json();

      if (!data.success) {
        setDeleteError(
          onChainApplied
            ? onChainDeleteFailed
            : (data.error ?? "Failed to delete group"),
        );
        setIsDeleting(false);
        return;
      }

      setShowDeleteModal(false);
      router.push(`/flow-councils/membership/${chainId}/${councilId}`);
    } catch (err) {
      console.error(err);
      setDeleteError(
        onChainApplied ? onChainDeleteFailed : "Failed to delete group",
      );
      setIsDeleting(false);
    }
  };

  const isLastGroup = groups.length <= 1;
  // A metrics group's method is locked after creation: switching away would
  // require removing the bot voter, and switching to it requires adding the bot
  // (done only in the create flow).
  const isMetricsGroup = group?.eligibilityMethod === "metrics";
  const isNftGroup = group?.eligibilityMethod === "nft";
  const hasMembers = (group?.memberCount ?? 0) > 0;
  const councilHasGoodDollar = groups.some(
    (g) => g.eligibilityMethod === "gooddollar",
  );
  const councilHasNft = groups.some((g) => g.eligibilityMethod === "nft");
  // A populated group's method is locked, matching how metrics groups behave,
  // and the two automated methods stay mutually exclusive per council.
  const nftOptionDisabled =
    (!isNftGroup && (councilHasGoodDollar || hasMembers)) ||
    (isNftGroup && hasMembers);
  const nftMethodLocked = isNftGroup && hasMembers;
  const goodDollarOptionDisabled =
    councilHasNft && group?.eligibilityMethod !== "gooddollar";
  const nftConfigChanged =
    isNftGroup &&
    (editNftDraft.contractAddress.trim().toLowerCase() !==
      (group?.nftContractAddress ?? "").toLowerCase() ||
      editNftDraft.tokenId.trim() !== (group?.nftTokenId ?? ""));

  // Reason the delete action is unavailable (rendered as a tooltip on the
  // disabled trash icon). Mirrors the server guards: a council must keep at
  // least one group, and a non-metrics group must be empty. A metrics group can
  // be deleted with its single bot voter present (deletion zeroes it on-chain).
  const deleteBlockedReason = !group
    ? null
    : isLastGroup
      ? "A council must always have at least one group."
      : !isMetricsGroup && group.memberCount > 0
        ? "Group must be empty to be deleted."
        : null;

  if (!groupsLoading && !group) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
        >
          <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-3">
            <Card.Title className="fs-5 fw-semi-bold">
              Group not found.
            </Card.Title>
            <Link
              href={`/flow-councils/membership/${chainId}/${councilId}`}
              className="text-primary text-decoration-none fw-semi-bold"
            >
              Back to groups
            </Link>
          </Card>
        </Stack>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        {groupsLoading || !group ? (
          <Stack
            direction="horizontal"
            className="justify-content-center py-5 mt-3"
          >
            <Spinner />
          </Stack>
        ) : (
          <>
            <Link
              href={`/flow-councils/membership/${chainId}/${councilId}`}
              className="text-primary text-decoration-none fw-semi-bold align-self-start mt-3 mb-1"
            >
              ← Back to groups
            </Link>

            <Card className="bg-lace-100 rounded-4 border-0 p-4">
              <Card.Header className="bg-transparent border-0 rounded-4 p-0">
                {/* Static structure, stays fixed whether or not we're editing,
                    so entering edit mode only expands the card downward. */}
                <Stack
                  direction="horizontal"
                  className="justify-content-between align-items-center gap-2"
                >
                  <div>
                    <Card.Title className="fs-5 fw-semi-bold mb-1">
                      {group.name}
                    </Card.Title>
                    <Card.Text className="text-info mb-0">
                      {prettyEligibility(group.eligibilityMethod)} eligibility
                    </Card.Text>
                  </div>
                  {isManager && !isEditing ? (
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="flex-shrink-0"
                    >
                      <Button
                        variant="transparent"
                        className="p-2 border-0"
                        aria-label="Edit group"
                        onClick={enterEditMode}
                      >
                        <Image
                          src="/edit.svg"
                          alt="Edit group"
                          width={20}
                          height={20}
                          className="d-block"
                        />
                      </Button>
                      {deleteBlockedReason ? (
                        <InfoTooltip
                          position={{ top: true }}
                          wrapperClassName="d-flex"
                          content={
                            <p className="m-0 p-2">{deleteBlockedReason}</p>
                          }
                          target={
                            <Button
                              variant="transparent"
                              className="p-2 border-0"
                              aria-label="Delete group"
                              disabled
                            >
                              <Image
                                src="/trash.svg"
                                alt="Delete group"
                                width={20}
                                height={20}
                                className="d-block"
                              />
                            </Button>
                          }
                        />
                      ) : (
                        <Button
                          variant="transparent"
                          className="p-2 border-0"
                          aria-label="Delete group"
                          onClick={() => {
                            setDeleteError("");
                            setShowDeleteModal(true);
                          }}
                        >
                          <Image
                            src="/trash.svg"
                            alt="Delete group"
                            width={20}
                            height={20}
                            className="d-block"
                          />
                        </Button>
                      )}
                    </Stack>
                  ) : null}
                </Stack>

                {/* Automated-eligibility groups surface their default allocation
                    and manager (with the grant action) read-only here, so an
                    admin can see/repair bot permissions without entering edit
                    mode. */}
                {group.eligibilityMethod === "gooddollar" ||
                group.eligibilityMethod === "nft" ? (
                  <Stack direction="vertical" gap={3} className="mt-4">
                    <div>
                      <span className="fw-semi-bold d-block mb-1">
                        Default vote allocation
                      </span>
                      <span>{group.defaultVotingPower}</span>
                    </div>
                    <EligibilityManagerField
                      chainId={chainId}
                      botHasRole={botHasVoterManagerRole}
                      isAdmin={isAdmin}
                      isWrongChain={connectedChain?.id !== chainId}
                      isGranting={isGranting}
                      onAddPermissions={handleAddPermissions}
                    />
                    {grantError ? (
                      <Alert variant="danger" className="mb-0">
                        {grantError}
                      </Alert>
                    ) : null}
                  </Stack>
                ) : null}

                {/* Metrics groups surface the API key manager read-only here,
                    so an admin can mint/revoke keys and copy the ballot endpoint
                    without entering edit mode. The bot's vote power is shown in
                    the "Votes assigned" stat below, so it isn't repeated here. */}
                {group.eligibilityMethod === "metrics" ? (
                  <Stack direction="vertical" gap={3} className="mt-4">
                    <MetricsApiKeysPanel
                      chainId={chainId}
                      councilId={councilId}
                      isManager={isManager}
                    />
                  </Stack>
                ) : null}
              </Card.Header>
              <Card.Body className="p-0 mt-4">
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={4}
                  className="flex-wrap"
                >
                  <Stack direction="vertical">
                    {isMetricsGroup ? (
                      <>
                        <span className="text-info fs-6">Voter</span>
                        {network?.blockExplorer ? (
                          <Link
                            href={`${network.blockExplorer}/address/${FLOW_STATE_BOT_ADDRESS}`}
                            target="_blank"
                            rel="noreferrer"
                            className="fs-5 fw-semi-bold text-primary text-decoration-none"
                          >
                            {truncateAddress(FLOW_STATE_BOT_ADDRESS)}
                          </Link>
                        ) : (
                          <span className="fs-5 fw-semi-bold">
                            {truncateAddress(FLOW_STATE_BOT_ADDRESS)}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-info fs-6">Voters</span>
                        <span className="fs-5 fw-semi-bold">
                          {group.memberCount}
                        </span>
                      </>
                    )}
                  </Stack>
                  <Stack direction="vertical">
                    <span className="text-info fs-6">Votes assigned</span>
                    <span className="fs-5 fw-semi-bold">
                      {metrics.assigned}
                    </span>
                  </Stack>
                  <Stack direction="vertical">
                    <span className="text-info fs-6">Votes used</span>
                    <span className="fs-5 fw-semi-bold">
                      {metrics.used} ({metrics.usedPct.toFixed(0)}%)
                    </span>
                  </Stack>
                  <Stack direction="vertical">
                    <span className="text-info fs-6">Share of votes</span>
                    <span className="fs-5 fw-semi-bold">
                      {metrics.share.toFixed(1)}%
                    </span>
                  </Stack>
                </Stack>

                {saveSuccess && !isEditing ? (
                  <Alert
                    variant="success"
                    dismissible
                    onClose={() => setSaveSuccess(false)}
                    className="mt-4 mb-0"
                  >
                    Group updated.
                  </Alert>
                ) : null}

                {/* Editable fields, revealed below the voter-stats anchor so
                    entering edit mode only expands the card downward, leaving
                    the title + stats fixed. The Eligibility Manager is
                    intentionally not editable here; its grant action lives in
                    the static GoodDollar block above. */}
                {isEditing ? (
                  <Stack
                    direction="vertical"
                    gap={3}
                    className="mt-4 pt-4 border-top"
                  >
                    <Form.Group>
                      <Form.Label className="fw-semi-bold">Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={editName}
                        maxLength={100}
                        disabled={isSaving}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label className="fw-semi-bold">
                        Eligibility method
                      </Form.Label>
                      <Form.Select
                        value={editEligibility}
                        disabled={isSaving || isMetricsGroup}
                        onChange={(e) =>
                          setEditEligibility(
                            e.target.value as EligibilityMethod,
                          )
                        }
                      >
                        <option value="manual" disabled={nftMethodLocked}>
                          Manual
                        </option>
                        <option
                          value="gooddollar"
                          disabled={
                            !isCelo ||
                            goodDollarOptionDisabled ||
                            nftMethodLocked
                          }
                        >
                          GoodDollar ID{!isCelo ? " (Celo only)" : ""}
                        </option>
                        <option value="metrics" disabled={!isMetricsGroup}>
                          Metrics
                        </option>
                        <option value="nft" disabled={nftOptionDisabled}>
                          NFT Holder
                        </option>
                      </Form.Select>
                      {isMetricsGroup ? (
                        <Form.Text className="text-info">
                          Metrics groups can&apos;t change their eligibility
                          method.
                        </Form.Text>
                      ) : null}
                      {!isMetricsGroup && nftOptionDisabled && hasMembers ? (
                        <Form.Text className="text-info">
                          A group&apos;s eligibility method is locked once it
                          has members.
                        </Form.Text>
                      ) : null}
                      {!isMetricsGroup &&
                      councilHasGoodDollar &&
                      !isNftGroup &&
                      !hasMembers ? (
                        <Form.Text className="text-info">
                          This council uses GoodDollar eligibility. A council
                          uses one automated method or the other.
                        </Form.Text>
                      ) : null}
                      {goodDollarOptionDisabled ? (
                        <Form.Text className="text-info">
                          This council uses NFT eligibility. A council uses one
                          automated method or the other.
                        </Form.Text>
                      ) : null}
                    </Form.Group>

                    {editEligibility === "nft" ? (
                      <>
                        <NftGroupFields
                          chainId={chainId}
                          councilId={councilId}
                          draft={editNftDraft}
                          onChange={setEditNftDraft}
                          onBlockedChange={setEditNftBlocked}
                          onCollectionDetected={(collectionName, address) =>
                            setEditName(
                              (current) =>
                                current ||
                                collectionName ||
                                truncateAddress(address),
                            )
                          }
                          disabled={isSaving}
                        />
                        {nftConfigChanged && hasMembers ? (
                          <Alert variant="warning">
                            Existing members keep the votes they already have
                            and are not re-checked against the new collection.
                            Use the voter table below to remove anyone who no
                            longer qualifies.
                          </Alert>
                        ) : null}
                      </>
                    ) : null}

                    {editEligibility === "gooddollar" ||
                    editEligibility === "metrics" ||
                    editEligibility === "nft" ? (
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          {editEligibility === "metrics"
                            ? "Vote power"
                            : "Default vote allocation"}
                        </Form.Label>
                        <Form.Control
                          type="text"
                          inputMode="numeric"
                          style={{ maxWidth: 120 }}
                          value={editDefaultVotingPower}
                          disabled={isSaving}
                          onChange={(e) => {
                            const value = e.target.value;

                            if (
                              value === "" ||
                              (/^\d+$/.test(value) && Number(value) <= 1e6)
                            ) {
                              setEditDefaultVotingPower(value);
                            }
                          }}
                        />
                        <Form.Text className="text-info">
                          {editEligibility === "metrics"
                            ? "Total votes the bot allocates across recipients. Changing this submits an on-chain transaction."
                            : "Applied only to voters added through this group after the change. Existing members are not updated."}
                        </Form.Text>
                      </Form.Group>
                    ) : null}

                    {saveError ? (
                      <Alert variant="danger" className="mb-0">
                        {saveError}
                      </Alert>
                    ) : null}

                    <Stack direction="vertical" gap={2}>
                      <Button
                        className="fs-lg fw-semi-bold py-4 rounded-4"
                        disabled={
                          !isManager ||
                          isSaving ||
                          (editEligibility === "nft" &&
                            (editNftBlocked ||
                              !isNftDraftComplete(editNftDraft)))
                        }
                        onClick={handleSave}
                      >
                        {isSaving ? <Spinner size="sm" /> : "Save"}
                      </Button>
                      <Button
                        variant="danger"
                        className="fs-lg fw-semi-bold py-4 rounded-4 text-white"
                        disabled={isSaving}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                ) : null}
              </Card.Body>
            </Card>

            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-4 mb-30">
              <Card.Body className="p-0">
                {/* A metrics group has a single bot voter driven entirely by the
                    ballot API, so the batch voter table is replaced with the
                    integration spec and the bot's current per-recipient
                    allocation. */}
                {isMetricsGroup ? (
                  <MetricsIntegrationPanel
                    chainId={chainId}
                    councilId={councilId}
                    defaultVotingPower={group.defaultVotingPower}
                  />
                ) : (
                  <>
                    {q.error ? (
                      <Alert
                        variant="danger"
                        dismissible
                        onClose={() => discard()}
                        className="d-flex flex-wrap align-items-center justify-content-between gap-2"
                      >
                        <span className="fw-semi-bold">{q.error.message}</span>
                        <Button
                          size="sm"
                          className="fw-semi-bold"
                          onClick={() => q.resume()}
                        >
                          Retry
                        </Button>
                      </Alert>
                    ) : null}
                    {cleanupError ? (
                      <Alert
                        variant="danger"
                        dismissible
                        onClose={() => clearCleanupError()}
                        className="fw-semi-bold"
                      >
                        {cleanupError}
                      </Alert>
                    ) : null}
                    <VoterTable
                      chainId={chainId}
                      councilId={councilId}
                      groupId={groupId}
                      defaultVotingPower={group.defaultVotingPower}
                      voters={groupVoters}
                      allGroups={groupOptions}
                      existingOnchainAccounts={existingOnchainAccounts}
                      isManager={isManager}
                      q={qForChildren}
                      maxVotingSpread={maxVotingSpread}
                      onRefresh={refresh}
                    />
                  </>
                )}
              </Card.Body>
            </Card>
          </>
        )}
      </Stack>

      <Modal
        show={showDeleteModal}
        centered
        onHide={() => setShowDeleteModal(false)}
      >
        <Modal.Header closeButton className="border-0 p-4">
          <Modal.Title className="fs-5 fw-semi-bold">Delete group</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-0">
          <p className="mb-0">
            Are you sure you want to delete{" "}
            <span className="fw-semi-bold">{group?.name}</span>? This cannot be
            undone.
          </p>
          {isMetricsGroup ? (
            <p className="mt-3 mb-0">
              Deleting this group will remove the metrics voter. You must sign
              an onchain transaction to complete this action.
            </p>
          ) : null}
          {deleteError ? (
            <Alert variant="danger" className="mt-3 mb-0">
              {deleteError}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <Button
            variant="secondary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => setShowDeleteModal(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-4 px-4 py-2 fw-semi-bold text-white"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Spinner size="sm" /> : "Delete"}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
