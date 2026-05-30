"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfig, useAccount, usePublicClient } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Modal from "react-bootstrap/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { useChunkedTxQueue } from "@/app/flow-councils/hooks/useChunkedTxQueue";
import {
  computeCastVotes,
  shareOfVotes,
} from "@/app/flow-councils/lib/voterUtils";
import VoterTable from "./VoterTable";
import BulkActionToolbar from "./BulkActionToolbar";
import AddVotersModal from "./AddVotersModal";
import {
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  DEFAULT_ADMIN_ROLE,
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [showAddVoters, setShowAddVoters] = useState(false);
  // The voter table reports its current client-side filtered subset up so the
  // bulk toolbar's "Apply to filtered" can target it.
  const [filteredVoters, setFilteredVoters] = useState<SubgraphVoter[]>([]);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const q = useChunkedTxQueue(wagmiConfig, publicClient, councilId);

  // Addresses whose DB classification must be dropped once the CURRENT onchain
  // removal queue finishes. A ref (not state) so recording it never triggers a
  // render; it is read in the queue-completion effect below. Every startQueue
  // call resets it (removals set it, every other operation clears it), so a
  // non-removal queue can never trigger a stale DB delete.
  const pendingRemovalRef = useRef<string[]>([]);

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
      q.startQueue(cid, chunks);
    },
    [q],
  );

  const qForChildren = useMemo(() => ({ ...q, startQueue }), [q, startQueue]);

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
    if (!queueDone) {
      return;
    }

    let cancelled = false;

    const finalize = async () => {
      const removed = pendingRemovalRef.current;

      // Only now that the onchain removal queue has FULLY completed do we drop
      // the DB classification rows. Clear the ref first so a transient effect
      // re-run can't fire the DELETE twice.
      if (removed.length > 0) {
        pendingRemovalRef.current = [];

        try {
          await fetch("/api/flow-council/voter-groups/members", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId, councilId, addresses: removed }),
          });
        } catch (err) {
          console.error(err);
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

  // Seed the editable form from the loaded group.
  useEffect(() => {
    if (!group) {
      return;
    }

    setEditName(group.name);
    setEditEligibility(group.eligibilityMethod);
    setEditDefaultVotingPower(String(group.defaultVotingPower));
  }, [group]);

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

  const handleSave = async () => {
    if (!group) {
      return;
    }

    const name = editName.trim();
    const defaultVotingPower = Number(editDefaultVotingPower);

    if (!name) {
      setSaveError("Name is required");
      return;
    }

    if (
      editDefaultVotingPower === "" ||
      editDefaultVotingPower.includes(".") ||
      Number.isNaN(defaultVotingPower) ||
      defaultVotingPower < 1 ||
      defaultVotingPower > 1e6
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
          defaultVotingPower,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setSaveError(data.error ?? "Failed to save group");
        return;
      }

      setSaveSuccess(true);
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
  const deleteDisabled =
    !isManager || !group || group.memberCount > 0 || isLastGroup;

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

        {groupsLoading || !group ? (
          <Stack
            direction="horizontal"
            className="justify-content-center py-5 mt-3"
          >
            <Spinner />
          </Stack>
        ) : (
          <>
            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-3">
              <Card.Header className="bg-transparent border-0 rounded-4 p-0">
                <Link
                  href={`/flow-councils/membership/${chainId}/${councilId}`}
                  className="text-primary text-decoration-none fw-semi-bold"
                >
                  ← Back to groups
                </Link>
                <Card.Title className="fs-5 fw-semi-bold mt-2">
                  {group.name}
                </Card.Title>
                <Card.Text className="text-info mb-0">
                  {prettyEligibility(group.eligibilityMethod)} eligibility
                </Card.Text>
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
              </Card.Body>
            </Card>

            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-4">
              <Card.Header className="bg-transparent border-0 rounded-4 p-0">
                <Card.Title className="fs-6 fw-semi-bold">
                  Group settings
                </Card.Title>
              </Card.Header>
              <Card.Body className="p-0 mt-3">
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semi-bold">Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={editName}
                    maxLength={100}
                    disabled={!isManager || isSaving}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="d-flex align-items-center gap-2 fw-semi-bold">
                    Eligibility method
                    {!isCelo ? (
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
                            GoodDollar ID eligibility is only available on Celo.
                          </p>
                        }
                      />
                    ) : null}
                  </Form.Label>
                  <Form.Select
                    value={editEligibility}
                    disabled={!isManager || isSaving}
                    onChange={(e) =>
                      setEditEligibility(e.target.value as EligibilityMethod)
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="gooddollar" disabled={!isCelo}>
                      GoodDollar ID{!isCelo ? " (Celo only)" : ""}
                    </option>
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semi-bold">
                    Default vote allocation
                  </Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="numeric"
                    value={editDefaultVotingPower}
                    disabled={!isManager || isSaving}
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
                    Applied only to voters added through this group after the
                    change — existing members are not updated.
                  </Form.Text>
                </Form.Group>

                {editEligibility === "gooddollar" ? (
                  <Alert variant="info">
                    The Flow State bot must hold the Voter Manager role on this
                    council to add GoodDollar-verified voters.
                    {process.env.NEXT_PUBLIC_FLOW_STATE_BOT_ADDRESS ? (
                      <>
                        <br />
                        Bot address:{" "}
                        <span className="text-break">
                          {process.env.NEXT_PUBLIC_FLOW_STATE_BOT_ADDRESS}
                        </span>
                      </>
                    ) : null}
                    <br />
                    <Link
                      href={`/flow-councils/permissions/${chainId}/${councilId}`}
                      className="text-primary fw-semi-bold text-decoration-none"
                    >
                      Manage permissions
                    </Link>
                  </Alert>
                ) : null}

                {saveError ? (
                  <Alert variant="danger" className="mb-3">
                    {saveError}
                  </Alert>
                ) : null}
                {saveSuccess ? (
                  <Alert variant="success" className="mb-3">
                    Group updated.
                  </Alert>
                ) : null}

                <Button
                  className="rounded-4 px-4 py-2 fw-semi-bold"
                  disabled={!isManager || isSaving}
                  onClick={handleSave}
                >
                  {isSaving ? <Spinner size="sm" /> : "Save"}
                </Button>
              </Card.Body>
            </Card>

            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-4">
              <Card.Header className="bg-transparent border-0 rounded-4 p-0">
                <Card.Title className="fs-6 fw-semi-bold">Voters</Card.Title>
              </Card.Header>
              <Card.Body className="p-0 mt-3">
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
                {isManager ? (
                  <>
                    <BulkActionToolbar
                      councilId={councilId}
                      allGroupVoters={groupVoters}
                      filteredVoters={filteredVoters}
                      isManager={isManager}
                      q={qForChildren}
                      maxVotingSpread={maxVotingSpread}
                    />
                    <Stack
                      direction="horizontal"
                      className="justify-content-end mb-3"
                    >
                      <Button
                        className="rounded-4 px-4 py-2 fw-semi-bold"
                        onClick={() => setShowAddVoters(true)}
                      >
                        Add voters
                      </Button>
                    </Stack>
                  </>
                ) : null}
                <VoterTable
                  chainId={chainId}
                  councilId={councilId}
                  groupId={groupId}
                  groupMembers={group.members}
                  voters={groupVoters}
                  allGroups={groupOptions}
                  isManager={isManager}
                  q={qForChildren}
                  maxVotingSpread={maxVotingSpread}
                  onRefresh={refresh}
                  onFilteredChange={setFilteredVoters}
                />
              </Card.Body>
            </Card>

            <Card className="bg-lace-100 rounded-4 border-0 p-4 mt-4 mb-30">
              <Card.Header className="bg-transparent border-0 rounded-4 p-0">
                <Card.Title className="fs-6 fw-semi-bold">
                  Delete group
                </Card.Title>
                <Card.Text className="text-info mb-0">
                  {isLastGroup
                    ? "A council must always have at least one group."
                    : group.memberCount > 0
                      ? "Remove all voters from this group before deleting it."
                      : "Permanently removes this group's classification. No onchain effect."}
                </Card.Text>
              </Card.Header>
              <Card.Body className="p-0 mt-3">
                <Button
                  variant="danger"
                  className="rounded-4 px-4 py-2 fw-semi-bold"
                  disabled={deleteDisabled}
                  onClick={() => {
                    setDeleteError("");
                    setShowDeleteModal(true);
                  }}
                >
                  Delete group
                </Button>
              </Card.Body>
            </Card>
          </>
        )}
      </Stack>

      {group ? (
        <AddVotersModal
          show={showAddVoters}
          onHide={() => setShowAddVoters(false)}
          chainId={chainId}
          councilId={councilId}
          groupId={groupId}
          defaultVotingPower={group.defaultVotingPower}
          existingOnchainAccounts={existingOnchainAccounts}
          q={qForChildren}
          maxVotingSpread={maxVotingSpread}
          onRefresh={refresh}
        />
      ) : null}

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
            className="rounded-4 px-4 py-2 fw-semi-bold"
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
