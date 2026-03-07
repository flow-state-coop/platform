"use client";

import { useState, useEffect } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProgressBar from "react-bootstrap/ProgressBar";
import Markdown from "@/components/Markdown";
import MarkdownEditor from "@/components/MarkdownEditor";
import { normalizeEvidenceUrl } from "@/app/api/flow-council/validation";
import type {
  MilestoneWithProgress,
  DeliverableProgress,
  EvidenceLink,
  MilestoneProgressData,
} from "./types";

type MilestoneCardProps = {
  milestone: MilestoneWithProgress;
  applicationId: number;
  projectId: string;
  isManager: boolean;
  onSaved: () => void;
  hasSession?: boolean;
  csrfToken?: string;
  address?: string;
  connectedChainId?: number;
  openConnectModal?: (() => void) | undefined;
  switchChain?: (args: { chainId: number }) => void;
  handleSignIn?: (csrfToken: string) => void;
};

type EditingDeliverable = {
  completion: number;
  evidence: EvidenceLink[];
};

const TYPE_LABELS: Record<string, string> = {
  build: "Build",
  growth: "Growth",
};

function CompletionBar({ completion }: { completion: number }) {
  const variant =
    completion === 100 ? "success" : completion >= 50 ? "primary" : "info";

  return (
    <Stack direction="horizontal" gap={2} className="align-items-center">
      <ProgressBar
        now={completion}
        variant={variant}
        className="rounded-pill flex-shrink-0"
        style={{ width: 80, height: 8, backgroundColor: "#e9ecef" }}
      />
      <span
        className={`fs-sm fw-semi-bold text-nowrap text-${variant}`}
        style={{ minWidth: 32 }}
      >
        {completion}%
      </span>
    </Stack>
  );
}

function EvidencePills({ evidence }: { evidence: EvidenceLink[] }) {
  if (evidence.length === 0) return null;
  return (
    <Stack direction="horizontal" className="flex-wrap gap-2 mt-2">
      {evidence.map((e, i) => (
        <a
          key={i}
          href={e.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none d-inline-flex align-items-center gap-1 rounded-pill px-3 py-1 fs-sm fw-semi-bold"
          style={{
            backgroundColor: "rgba(60, 101, 91, 0.1)",
            color: "#3c655b",
            border: "1px solid rgba(60, 101, 91, 0.25)",
          }}
        >
          <Image src="/link.svg" alt="" width={12} height={12} />
          {e.name}
          <Image
            src="/open-new.svg"
            alt=""
            width={10}
            height={10}
            style={{ opacity: 0.6 }}
          />
        </a>
      ))}
    </Stack>
  );
}

function DeliverableEditForm({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: DeliverableProgress;
  onCancel: () => void;
  onSave: (data: EditingDeliverable) => void;
  saving: boolean;
}) {
  const [completion, setCompletion] = useState(initial.completion);
  const [evidence, setEvidence] = useState<EvidenceLink[]>(
    initial.evidence.length > 0 ? initial.evidence : [{ name: "", link: "" }],
  );

  const handleEvidenceChange = (
    index: number,
    field: keyof EvidenceLink,
    value: string,
  ) => {
    const updated = [...evidence];
    updated[index] = { ...updated[index], [field]: value };
    setEvidence(updated);
  };

  const addEvidence = () => {
    setEvidence([...evidence, { name: "", link: "" }]);
  };

  const removeEvidence = (index: number) => {
    setEvidence(evidence.filter((_, i) => i !== index));
  };

  return (
    <Stack direction="vertical" gap={3} className="mt-3">
      <Form.Label className="mb-0 fw-semi-bold">Evidence Links</Form.Label>
      {evidence.map((e, i) => (
        <div
          key={i}
          className="border rounded-3 p-3 position-relative"
          style={{ backgroundColor: "#fafafa" }}
        >
          <Stack direction="horizontal" className="align-items-center mb-2">
            <span className="fs-xs fw-semi-bold text-muted">
              Evidence {i + 1}
            </span>
            <Button
              variant="link"
              size="sm"
              className="p-0 ms-auto d-flex align-items-center"
              onClick={() => removeEvidence(i)}
            >
              <Image src="/trash.svg" alt="remove" width={14} height={14} />
            </Button>
          </Stack>
          <Form.Control
            size="sm"
            placeholder="Label (e.g., GitHub PR)"
            value={e.name}
            onChange={(ev) => handleEvidenceChange(i, "name", ev.target.value)}
            className="rounded-2 mb-2"
          />
          <Form.Control
            size="sm"
            placeholder="https://..."
            value={e.link}
            onChange={(ev) => handleEvidenceChange(i, "link", ev.target.value)}
            className="rounded-2"
          />
        </div>
      ))}
      <Button
        variant="outline-primary"
        size="sm"
        className="align-self-start rounded-3 d-flex align-items-center gap-1"
        onClick={addEvidence}
      >
        <Image src="/add.svg" alt="" width={14} height={14} />
        Add Evidence
      </Button>
      <Stack direction="horizontal" gap={2} className="align-items-center">
        <Form.Label className="mb-0 text-nowrap fw-semi-bold">
          % Complete
        </Form.Label>
        <Form.Control
          type="number"
          size="sm"
          min={0}
          max={100}
          value={completion}
          onChange={(ev) =>
            setCompletion(Math.min(100, Math.max(0, Number(ev.target.value))))
          }
          className="rounded-3"
          style={{ width: 80 }}
        />
      </Stack>
      <Stack direction="horizontal" gap={2} className="justify-content-end">
        <Button
          variant="outline-secondary"
          className="rounded-3"
          onClick={onCancel}
          disabled={saving}
          style={{ width: 100 }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          className="rounded-3"
          onClick={() => onSave({ completion, evidence })}
          disabled={saving}
          style={{ width: 100 }}
        >
          {saving ? <Spinner size="sm" /> : "Save"}
        </Button>
      </Stack>
    </Stack>
  );
}

export default function MilestoneCard({
  milestone,
  applicationId,
  projectId,
  isManager,
  onSaved,
  hasSession,
  csrfToken,
  address,
  connectedChainId,
  openConnectModal,
  switchChain,
  handleSignIn,
}: MilestoneCardProps) {
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingOtherDetails, setEditingOtherDetails] = useState(false);
  const [otherDetailsValue, setOtherDetailsValue] = useState(
    milestone.progress.otherDetails,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingEditIndex, setPendingEditIndex] = useState<number | null>(null);
  const [pendingOtherDetails, setPendingOtherDetails] = useState(false);

  const badgeLabel = `${TYPE_LABELS[milestone.type]} Milestone ${milestone.index + 1}`;
  const itemLabel = milestone.type === "build" ? "Deliverables" : "Activations";

  useEffect(() => {
    if (hasSession && pendingEditIndex !== null) {
      setEditingItemIndex(pendingEditIndex);
      setPendingEditIndex(null);
    }
    if (hasSession && pendingOtherDetails) {
      setOtherDetailsValue(milestone.progress.otherDetails);
      setEditingOtherDetails(true);
      setPendingOtherDetails(false);
    }
  }, [
    hasSession,
    pendingEditIndex,
    pendingOtherDetails,
    milestone.progress.otherDetails,
  ]);

  useEffect(() => {
    setPendingEditIndex(null);
    setPendingOtherDetails(false);
  }, [address]);

  const requireAuth = (onAuthed: () => void): boolean => {
    if (!address && openConnectModal) {
      openConnectModal();
      return false;
    }
    if (connectedChainId !== 42220 && switchChain) {
      switchChain({ chainId: 42220 });
      return false;
    }
    if (!hasSession && handleSignIn && csrfToken) {
      handleSignIn(csrfToken);
      return false;
    }
    onAuthed();
    return true;
  };

  const handleEditDeliverableClick = (index: number) => {
    const authed = requireAuth(() => setEditingItemIndex(index));
    if (!authed) setPendingEditIndex(index);
  };

  const handleEditOtherDetailsClick = () => {
    const authed = requireAuth(() => {
      setOtherDetailsValue(milestone.progress.otherDetails);
      setEditingOtherDetails(true);
    });
    if (!authed) setPendingOtherDetails(true);
  };

  const saveProgress = async (updatedProgress: MilestoneProgressData) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/flow-council/projects/${projectId}/milestones`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId,
            milestoneType: milestone.type,
            milestoneIndex: milestone.index,
            progress: updatedProgress,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        onSaved();
      } else {
        setSaveError(data.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save milestone progress:", err);
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeliverableSave = (
    itemIndex: number,
    data: EditingDeliverable,
  ) => {
    const filteredEvidence = data.evidence
      .filter((e) => e.name.trim() !== "" && e.link.trim() !== "")
      .map((e) => ({ ...e, link: normalizeEvidenceUrl(e.link) }));
    const updatedItems = [...milestone.progress.items];
    while (updatedItems.length <= itemIndex) {
      updatedItems.push({ completion: 0, evidence: [] });
    }
    updatedItems[itemIndex] = {
      completion: data.completion,
      evidence: filteredEvidence,
    };
    const updatedProgress: MilestoneProgressData = {
      ...milestone.progress,
      items: updatedItems,
    };
    saveProgress(updatedProgress).then(() => setEditingItemIndex(null));
  };

  const handleOtherDetailsSave = () => {
    const updatedProgress: MilestoneProgressData = {
      ...milestone.progress,
      otherDetails: otherDetailsValue,
    };
    saveProgress(updatedProgress).then(() => setEditingOtherDetails(false));
  };

  return (
    <div
      id={`milestone-${milestone.type}-${milestone.index}`}
      className="border border-2 rounded-4 overflow-hidden mb-4"
    >
      <div className="bg-secondary d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-1 px-3 px-sm-4 py-3">
        <h5 className="fw-bold mb-0 text-light">{milestone.title}</h5>
        <span
          className="fs-sm fw-semi-bold text-light text-nowrap rounded-pill px-3 py-1"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="p-3 p-sm-4" style={{ backgroundColor: "#fff" }}>
        <p className="text-info mb-4">{milestone.description}</p>

        <div className="mb-3">
          {milestone.itemNames.map((name, i) => {
            const itemProgress = milestone.progress.items[i] ?? {
              completion: 0,
              evidence: [],
            };
            const isEditing = editingItemIndex === i;

            return (
              <div
                key={i}
                className={`border rounded-4 p-3 mb-3 ${isEditing ? "border-primary border-2" : ""}`}
                style={{ backgroundColor: isEditing ? "#fff" : "#fbf7ef" }}
              >
                <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
                  <div>
                    <span
                      className="fs-xs text-muted text-uppercase fw-semi-bold"
                      style={{ letterSpacing: "0.05em" }}
                    >
                      {itemLabel.slice(0, -1)} {i + 1}
                    </span>
                    <div className="fw-semi-bold mt-1">{name}</div>
                  </div>
                  <Stack
                    direction="horizontal"
                    gap={3}
                    className="align-items-center align-self-end align-self-sm-center flex-shrink-0"
                  >
                    <CompletionBar completion={itemProgress.completion} />
                    {isManager && !isEditing && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="rounded-3 d-flex align-items-center gap-1 flex-shrink-0"
                        onClick={() => handleEditDeliverableClick(i)}
                      >
                        <Image src="/edit.svg" alt="" width={14} height={14} />
                        <span className="d-none d-sm-inline">Edit</span>
                      </Button>
                    )}
                  </Stack>
                </div>
                {!isEditing && (
                  <EvidencePills evidence={itemProgress.evidence} />
                )}
                {isEditing && (
                  <>
                    <hr className="my-3" />
                    <DeliverableEditForm
                      initial={itemProgress}
                      onCancel={() => setEditingItemIndex(null)}
                      onSave={(data) => handleDeliverableSave(i, data)}
                      saving={saving}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <hr className="my-3" />

        <Stack
          direction="horizontal"
          gap={2}
          className="align-items-center mb-2"
        >
          <span className="fw-bold">Other Details & Updates</span>
          {isManager && !editingOtherDetails && (
            <Button
              variant="outline-primary"
              size="sm"
              className="rounded-3 d-flex align-items-center gap-1"
              onClick={handleEditOtherDetailsClick}
            >
              <Image src="/edit.svg" alt="" width={14} height={14} />
              <span className="d-none d-sm-inline">Edit</span>
            </Button>
          )}
        </Stack>
        {saveError && <p className="text-danger small mb-2">{saveError}</p>}
        {editingOtherDetails ? (
          <Stack direction="vertical" gap={2}>
            <MarkdownEditor
              value={otherDetailsValue}
              onChange={(e) => setOtherDetailsValue(e.target.value)}
              resizable
              minHeight={100}
              characterCounter={{ value: otherDetailsValue, max: 5000 }}
            />
            <Stack
              direction="horizontal"
              gap={2}
              className="justify-content-end"
            >
              <Button
                variant="outline-secondary"
                className="rounded-3"
                onClick={() => setEditingOtherDetails(false)}
                disabled={saving}
                style={{ width: 100 }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="rounded-3"
                onClick={handleOtherDetailsSave}
                disabled={saving}
                style={{ width: 100 }}
              >
                {saving ? <Spinner size="sm" /> : "Save"}
              </Button>
            </Stack>
          </Stack>
        ) : milestone.progress.otherDetails ? (
          <Markdown>{milestone.progress.otherDetails}</Markdown>
        ) : (
          <p className="text-muted mb-0">(No additional details)</p>
        )}
      </div>
    </div>
  );
}
