"use client";

import { useState } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Markdown from "@/components/Markdown";
import InfoTooltip from "@/components/InfoTooltip";
import ResizableTextarea from "@/components/ResizableTextarea";
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
};

type EditingDeliverable = {
  completion: number;
  evidence: EvidenceLink[];
};

const TYPE_LABELS: Record<string, string> = {
  build: "Build",
  growth: "Growth",
};

function EvidencePills({ evidence }: { evidence: EvidenceLink[] }) {
  if (evidence.length === 0) return null;
  return (
    <Stack direction="horizontal" className="flex-wrap gap-1 mt-1">
      {evidence.map((e, i) => (
        <a
          key={i}
          href={e.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
        >
          <span className="badge bg-white text-primary border rounded-pill fw-normal">
            {e.name}
          </span>
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
    <Stack direction="vertical" gap={2} className="mt-2 bg-white rounded-3 p-3">
      <Form.Label className="mb-0 fw-semi-bold">Evidence Links</Form.Label>
      {evidence.map((e, i) => (
        <Stack
          key={i}
          direction="horizontal"
          gap={2}
          className="align-items-center"
        >
          <Form.Control
            size="sm"
            placeholder="Name"
            value={e.name}
            onChange={(ev) => handleEvidenceChange(i, "name", ev.target.value)}
            className="rounded-2"
          />
          <Form.Control
            size="sm"
            placeholder="https://..."
            value={e.link}
            onChange={(ev) => handleEvidenceChange(i, "link", ev.target.value)}
            className="rounded-2"
          />
          <Button
            variant="outline-danger"
            size="sm"
            className="flex-shrink-0 rounded-2 d-flex align-items-center justify-content-center"
            onClick={() => removeEvidence(i)}
            style={{ width: 30, height: 30 }}
          >
            &times;
          </Button>
        </Stack>
      ))}
      <Button
        variant="link"
        size="sm"
        className="p-0 align-self-start text-decoration-none"
        onClick={addEvidence}
      >
        + Add Evidence
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
}: MilestoneCardProps) {
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingOtherDetails, setEditingOtherDetails] = useState(false);
  const [otherDetailsValue, setOtherDetailsValue] = useState(
    milestone.progress.otherDetails,
  );
  const [saving, setSaving] = useState(false);

  const badgeLabel = `${TYPE_LABELS[milestone.type]} Milestone ${milestone.index + 1}`;
  const itemLabel = milestone.type === "build" ? "Deliverables" : "Activations";

  const saveProgress = async (updatedProgress: MilestoneProgressData) => {
    setSaving(true);
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
      }
    } catch (err) {
      console.error("Failed to save milestone progress:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeliverableSave = (
    itemIndex: number,
    data: EditingDeliverable,
  ) => {
    const filteredEvidence = data.evidence.filter(
      (e) => e.name.trim() !== "" && e.link.trim() !== "",
    );
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
    <div className="bg-lace-100 rounded-4 p-3 mb-3">
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-start mb-1"
      >
        <h5 className="fw-bold mb-0">{milestone.title}</h5>
        <span className="text-muted text-nowrap ms-3 fst-italic">
          {badgeLabel}
        </span>
      </Stack>
      <p className="mb-3">{milestone.description}</p>

      <div className="mb-3">
        {milestone.itemNames.map((name, i) => {
          const itemProgress = milestone.progress.items[i] ?? {
            completion: 0,
            evidence: [],
          };
          const isEditing = editingItemIndex === i;

          return (
            <div key={i} className="mb-3">
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-center mb-1"
              >
                <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                  {itemLabel.slice(0, -1)} {i + 1}
                </span>
                {isManager && !isEditing && (
                  <InfoTooltip
                    position={{ top: true }}
                    target={
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 flex-shrink-0 d-flex align-items-center"
                        onClick={() => setEditingItemIndex(i)}
                      >
                        <Image
                          src="/edit.svg"
                          alt="edit"
                          width={16}
                          height={16}
                        />
                      </Button>
                    }
                    content={<p className="m-0 p-2">Add evidence & details</p>}
                  />
                )}
              </Stack>
              <div className="border rounded-4 bg-white p-3">
                <Stack
                  direction="horizontal"
                  className="justify-content-between align-items-start"
                >
                  <span>{name}</span>
                  <span className="text-nowrap ms-3 fs-5 fw-semi-bold">
                    {itemProgress.completion}%
                  </span>
                </Stack>
                <EvidencePills evidence={itemProgress.evidence} />
              </div>
              {isEditing && (
                <DeliverableEditForm
                  initial={itemProgress}
                  onCancel={() => setEditingItemIndex(null)}
                  onSave={(data) => handleDeliverableSave(i, data)}
                  saving={saving}
                />
              )}
            </div>
          );
        })}
      </div>

      <Stack direction="horizontal" gap={2} className="align-items-center mb-2">
        <span className="fw-bold">Other Details & Updates</span>
        {isManager && !editingOtherDetails && (
          <Button
            variant="link"
            size="sm"
            className="p-0 d-flex align-items-center"
            onClick={() => {
              setOtherDetailsValue(milestone.progress.otherDetails);
              setEditingOtherDetails(true);
            }}
          >
            <Image src="/edit.svg" alt="edit" width={16} height={16} />
          </Button>
        )}
      </Stack>
      {editingOtherDetails ? (
        <Stack direction="vertical" gap={2}>
          <ResizableTextarea
            value={otherDetailsValue}
            onChange={(e) => setOtherDetailsValue(e.target.value)}
            maxLength={5000}
            minHeight={100}
            className="bg-white border rounded-3 py-3 px-3"
          />
          <Stack direction="horizontal" gap={2} className="justify-content-end">
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
  );
}
