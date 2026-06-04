"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
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
import {
  useChunkedTxQueue,
  splitIntoChunks,
} from "@/app/flow-councils/hooks/useChunkedTxQueue";
import { useGrantBotVoterManager } from "@/app/flow-councils/hooks/useGrantBotVoterManager";
import {
  computeCastVotes,
  shareOfVotes,
} from "@/app/flow-councils/lib/voterUtils";
import VoterTable from "./VoterTable";
import EligibilityManagerField from "./EligibilityManagerField";
import type { ChunkedQueue } from "./voterTableTypes";
import {
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  DEFAULT_ADMIN_ROLE,
  FLOW_STATE_BOT_ADDRESS,
} from "../lib/constants";

type GroupDetailProps = {
  chainId: number;
  councilId: string;
  groupId: number;
};

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

// Chunk size for the deferred DB membership delete. Kept well under the API's
// per-request cap so removing a large group (e.g. the auto-migrated Default
// group) never trips the limit.
const DELETE_BATCH = 1000;

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

function prettyEligibility(method: EligibilityMethod): string {
  return method === "gooddollar" ? "GoodDollar ID" : "Manual";
}

export default function GroupDetail(props: GroupDetailProps) {
  const { chainId, councilId, groupId } = props;

  const [groups, setGroups] = useState<VoterGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [editName, setEditName] = useState("");
  const [editEligibility, setEditEligibility] =
    useState<EligibilityMethod>("manual");
  const [editDefaultVotingPower, setEditDefaultVotingPower] = useState("10");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Surfaces a failure of the deferred DB classification cleanup that runs after
  // an onchain removal queue completes (the onchain removal itself succeeded).
  const [cleanupError, setCleanupError] = useState("");

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const q = useChunkedTxQueue(wagmiConfig, publicClient, councilId);

  // Addresses whose DB classification must be dropped once the CURRENT onchain
  // removal queue finishes. A ref (not state) so recording it never triggers a
  // render; it is read in the queue-completion effect below. Every startQueue
  // call resets it (removals set it, every other operation clears it), so a
  // non-removal queue can never trigger a stale DB delete.
  const pendingRemovalRef = useRef<string[]>([]);

  // Guards the queue-completion finalize effect so it runs exactly once per
  // queue: set when finalize starts, reset by startQueue when a new operation
  // begins. `queueDone` (below) is derived and stays true after completion, so
  // without this a stray re-render could re-enter the effect.
  const hasFinalizedRef = useRef(false);

  // The hook returns a stable `startQueue` reference, so capture it directly
  // instead of depending on the whole `q` object (a fresh object every render).
  // This keeps our wrapper — and `qForChildren` below — stable across renders.
  const queueStart = q.startQueue;

  // Wrap the shared queue so children enqueue a removal atomically with the DB
  // rows they intend to drop. The DB DELETE is deferred to queueDone (below) so
  // a failed/paused onchain queue never leaves a group showing empty while the
  // voters still hold onchain voting power.
  const startQueue = useCallback(
    (
      cid: string,
      chunks: { args: Record<string, unknown> }[],
      removalAddresses?: string[],
    ) => {
      pendingRemovalRef.current = removalAddresses ?? [];
      hasFinalizedRef.current = false;
      setCleanupError("");
      queueStart(cid, chunks);
    },
    [queueStart],
  );

  // Stabilized on the queue's individual fields rather than the hook's
  // render-fresh object, so children (VoterTable) only re-render when queue
  // state they actually read changes; the callbacks are stable hook references.
  const qForChildren = useMemo<ChunkedQueue>(
    () => ({
      startQueue,
      resume: q.resume,
      clear: q.clear,
      isPending: q.isPending,
      completedCount: q.completedCount,
      totalCount: q.totalCount,
      error: q.error,
    }),
    [
      startQueue,
      q.resume,
      q.clear,
      q.isPending,
      q.completedCount,
      q.totalCount,
      q.error,
    ],
  );

  const isCelo = chainId === CELO_CHAIN_ID;

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

  // Lowercased accounts already onchain with a non-zero allocation — the add
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

  // Re-pull both the subgraph voters and the DB groups. Children call this after
  // offchain changes; the parent also calls it once when the onchain queue
  // finishes (effect below).
  const refresh = useCallback(async () => {
    await refetch();
    await fetchGroups();
  }, [refetch, fetchGroups]);

  // When the chunked queue transitions to fully complete, drop any deferred DB
  // classification rows (for a removal) and refresh once so the table reflects
  // the new onchain state.
  const queueDone =
    q.totalCount > 0 && q.completedCount === q.totalCount && !q.isPending;

  useEffect(() => {
    if (!queueDone || hasFinalizedRef.current) {
      return;
    }

    hasFinalizedRef.current = true;

    let cancelled = false;

    const finalize = async () => {
      const removed = pendingRemovalRef.current;

      // Only now that the onchain removal queue has FULLY completed do we drop
      // the DB classification rows. Clear the ref first so a transient effect
      // re-run can't fire the DELETE twice.
      if (removed.length > 0) {
        pendingRemovalRef.current = [];

        // Chunked so a very large group removal stays under the endpoint's
        // per-request address cap. Each batch is checked on its own: a failed
        // batch (thrown, or a non-ok / !success response) is collected and
        // surfaced so the admin knows those classifications weren't cleared,
        // while the remaining batches still run.
        const failed: string[] = [];

        for (const batch of splitIntoChunks(removed, DELETE_BATCH)) {
          try {
            const res = await fetch("/api/flow-council/voter-groups/members", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chainId, councilId, addresses: batch }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.success) {
              failed.push(...batch);
            }
          } catch (err) {
            console.error(err);
            failed.push(...batch);
          }
        }

        if (failed.length > 0 && !cancelled) {
          setCleanupError(
            `Voters were removed onchain, but ${failed.length} could not be ` +
              `cleared from this group's records. Refresh and remove them ` +
              `again to retry.`,
          );
        }
      }

      if (!cancelled) {
        await refresh();
      }
    };

    finalize();

    return () => {
      cancelled = true;
    };
  }, [queueDone, refresh, chainId, councilId]);

  useEffect(() => {
    if (!flowCouncilQueryRes) {
      return;
    }

    fetchMore({
      variables: { skip: flowCouncilQueryRes.flowCouncil.voters.length },
    });
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
  }, [group, isEditing]);

  const metrics = useMemo(() => {
    if (!group) {
      return { assigned: 0, used: 0, usedPct: 0, share: 0 };
    }

    const memberVoters = group.members
      .map((member) => votersByAccount.get(member.toLowerCase()))
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

    return { assigned, used, usedPct, share };
  }, [group, votersByAccount, totalCouncilAssigned]);

  const enterEditMode = () => {
    if (!group) {
      return;
    }

    setEditName(group.name);
    setEditEligibility(group.eligibilityMethod);
    setEditDefaultVotingPower(String(group.defaultVotingPower));
    setSaveError("");
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    if (group) {
      setEditName(group.name);
      setEditEligibility(group.eligibilityMethod);
      setEditDefaultVotingPower(String(group.defaultVotingPower));
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
    const defaultVotingPower = Number(editDefaultVotingPower);

    if (!name) {
      setSaveError("Name is required");
      return;
    }

    if (
      isGoodDollar &&
      (editDefaultVotingPower === "" ||
        editDefaultVotingPower.includes(".") ||
        Number.isNaN(defaultVotingPower) ||
        defaultVotingPower < 1 ||
        defaultVotingPower > 1e6)
    ) {
      setSaveError("Default votes must be an integer between 1 and 1M");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setSaveSuccess(false);

      const res = await fetch(`/api/flow-council/voter-groups?id=${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          councilId,
          name,
          eligibilityMethod: editEligibility,
          ...(isGoodDollar ? { defaultVotingPower } : {}),
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setSaveError(data.error ?? "Failed to save group");
        return;
      }

      setSaveSuccess(true);
      setIsEditing(false);
      await fetchGroups();
    } catch (err) {
      console.error(err);
      setSaveError("Failed to save group");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!group) {
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError("");

      const res = await fetch(`/api/flow-council/voter-groups?id=${group.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, councilId }),
      });
      const data = await res.json();

      if (!data.success) {
        setDeleteError(data.error ?? "Failed to delete group");
        setIsDeleting(false);
        return;
      }

      setShowDeleteModal(false);
      router.push(`/flow-councils/membership/${chainId}/${councilId}`);
    } catch (err) {
      console.error(err);
      setDeleteError("Failed to delete group");
      setIsDeleting(false);
    }
  };

  const isLastGroup = groups.length <= 1;

  // Reason the delete action is unavailable (rendered as a tooltip on the
  // disabled trash icon). Mirrors the server guards: a group must be empty and
  // a council must keep at least one group.
  const deleteBlockedReason = !group
    ? null
    : group.memberCount > 0
      ? "Group must be empty to be deleted."
      : isLastGroup
        ? "A council must always have at least one group."
        : null;

  const showResumeBanner =
    q.totalCount > 0 &&
    q.completedCount < q.totalCount &&
    q.councilId === councilId;

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
                disabled={q.isPending}
              >
                {q.isPending ? <Spinner size="sm" /> : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                className="fw-semi-bold"
                onClick={() => q.clear()}
                disabled={q.isPending}
              >
                Discard
              </Button>
            </Stack>
          </Alert>
        ) : null}

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
                {/* Static structure — stays fixed whether or not we're editing,
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
                {group.eligibilityMethod === "gooddollar" ? (
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

                {/* Editable fields — revealed below the static structure. The
                    Eligibility Manager is intentionally not editable here; its
                    grant action lives in the static block above. */}
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
                        disabled={isSaving}
                        onChange={(e) =>
                          setEditEligibility(
                            e.target.value as EligibilityMethod,
                          )
                        }
                      >
                        <option value="manual">Manual</option>
                        <option value="gooddollar" disabled={!isCelo}>
                          GoodDollar ID{!isCelo ? " (Celo only)" : ""}
                        </option>
                      </Form.Select>
                    </Form.Group>

                    {editEligibility === "gooddollar" ? (
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          Default vote allocation
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
                          Applied only to voters added through this group after
                          the change — existing members are not updated.
                        </Form.Text>
                      </Form.Group>
                    ) : null}

                    {saveError ? (
                      <Alert variant="danger" className="mb-0">
                        {saveError}
                      </Alert>
                    ) : null}

                    <Stack direction="horizontal" gap={2}>
                      <Button
                        className="rounded-4 px-4 py-2 fw-semi-bold flex-fill"
                        disabled={!isManager || isSaving}
                        onClick={handleSave}
                      >
                        {isSaving ? <Spinner size="sm" /> : "Save"}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        className="rounded-4 px-4 py-2 fw-semi-bold flex-fill"
                        disabled={isSaving}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </Stack>
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
                    <span className="text-info fs-6">Voters</span>
                    <span className="fs-5 fw-semi-bold">
                      {group.memberCount}
                    </span>
                  </Stack>
                  <Stack direction="vertical">
                    <span className="text-info fs-6">Valid votes assigned</span>
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
              </Card.Body>
            </Card>

            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-4 mb-30">
              <Card.Body className="p-0">
                {q.error ? (
                  <Alert
                    variant="danger"
                    dismissible
                    onClose={() => q.clear()}
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
                    onClose={() => setCleanupError("")}
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
