"use client";

import { useState } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProgressBar from "react-bootstrap/ProgressBar";
import Markdown from "@/components/Markdown";
import MarkdownEditor from "@/components/MarkdownEditor";
import InfoTooltip from "@/components/InfoTooltip";
import CharacterCounter from "@/app/flow-councils/components/CharacterCounter";
import { CHARACTER_LIMITS } from "@/app/flow-councils/constants";
import useRequireAuth from "@/hooks/requireAuth";
import { normalizeUrl } from "@/app/flow-councils/utils/normalizeUrl";
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
  editsUnlocked: boolean;
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

function DefinitionEditForm({
  milestone,
  onCancel,
  onSave,
  saving,
}: {
  milestone: MilestoneWithProgress;
  onCancel: () => void;
  onSave: (data: {
    title: string;
    description: string;
    items: string[];
  }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description);
  const [items, setItems] = useState<string[]>(
    milestone.itemNames.length > 0 ? [...milestone.itemNames] : [""],
  );
  const [validated, setValidated] = useState(false);

  const itemLabel = milestone.type === "build" ? "Deliverable" : "Activation";

  const isTitleEmpty = !title.trim();
  const isDescriptionShort =
    description.length < CHARACTER_LIMITS.milestoneDescription.min;
  const isDescriptionLong =
    description.length > CHARACTER_LIMITS.milestoneDescription.max;
  const hasValidItem = items.some((item) => item.trim() !== "");

  const titleInvalid = validated && isTitleEmpty;
  const descriptionInvalid =
    validated && (isDescriptionShort || isDescriptionLong);
  const itemsInvalid = validated && !hasValidItem;

  const handleItemChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    setItems(updated);
  };

  const addItem = () => setItems([...items, ""]);

  const removeItem = (index: number) => {
    const filtered = items.filter((_, i) => i !== index);
    setItems(filtered.length > 0 ? filtered : [""]);
  };

  const handleSubmit = () => {
    setValidated(true);
    if (
      isTitleEmpty ||
      isDescriptionShort ||
      isDescriptionLong ||
      !hasValidItem
    )
      return;
    onSave({ title, description, items });
  };

  return (
    <Stack direction="vertical" gap={3}>
      <Form.Group>
        <Form.Label className="fw-semi-bold">Title*</Form.Label>
        <Form.Control
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-3"
          placeholder="Milestone title"
          isInvalid={titleInvalid}
        />
        {titleInvalid && (
          <Form.Text className="text-danger">Title is required</Form.Text>
        )}
      </Form.Group>
      <Form.Group>
        <Form.Label className="fw-semi-bold">Description*</Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-3"
          style={{ resize: "vertical" }}
          placeholder="Describe the outcomes you aim to achieve"
          isInvalid={descriptionInvalid}
        />
        <CharacterCounter
          value={description}
          min={CHARACTER_LIMITS.milestoneDescription.min}
          max={CHARACTER_LIMITS.milestoneDescription.max}
        />
      </Form.Group>
      <Form.Group>
        <Form.Label className="fw-semi-bold">{itemLabel}s*</Form.Label>
        <Stack direction="vertical" gap={2}>
          {items.map((item, i) => (
            <Stack key={i} direction="horizontal" gap={2}>
              <Form.Control
                type="text"
                value={item}
                onChange={(e) => handleItemChange(i, e.target.value)}
                className="rounded-3"
                placeholder={`${itemLabel} ${i + 1}`}
                isInvalid={itemsInvalid && i === 0}
              />
              {items.length > 1 && (
                <Button
                  variant="link"
                  className="p-0 d-flex align-items-center flex-shrink-0"
                  onClick={() => removeItem(i)}
                >
                  <Image src="/close.svg" alt="Remove" width={20} height={20} />
                </Button>
              )}
            </Stack>
          ))}
          {itemsInvalid && (
            <Form.Text className="text-danger">
              At least one {itemLabel.toLowerCase()} is required
            </Form.Text>
          )}
          <Button
            variant="link"
            className="p-0 text-start text-decoration-underline fw-semi-bold text-primary align-self-start"
            onClick={addItem}
          >
            Add {itemLabel}
          </Button>
        </Stack>
      </Form.Group>
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
          onClick={handleSubmit}
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
  editsUnlocked,
  onSaved,
}: MilestoneCardProps) {
  const { requireAuth } = useRequireAuth();

  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingOtherDetails, setEditingOtherDetails] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState(false);
  const [defSaving, setDefSaving] = useState(false);
  const [defError, setDefError] = useState<string | null>(null);
  const [otherDetailsValue, setOtherDetailsValue] = useState(
    milestone.progress.otherDetails,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isProgressEditing = editingItemIndex !== null || editingOtherDetails;

  const badgeLabel = `${TYPE_LABELS[milestone.type]} Milestone ${milestone.index + 1}`;
  const itemLabel = milestone.type === "build" ? "Deliverables" : "Activations";

  const handleEditDeliverableClick = (index: number) => {
    requireAuth(() => setEditingItemIndex(index));
  };

  const handleEditOtherDetailsClick = () => {
    requireAuth(() => {
      setOtherDetailsValue(milestone.progress.otherDetails);
      setEditingOtherDetails(true);
    });
  };

  const handleEditDefinitionClick = () => {
    requireAuth(() => setEditingDefinition(true));
  };

  const handleDefinitionSave = async (data: {
    title: string;
    description: string;
    items: string[];
  }) => {
    setDefSaving(true);
    setDefError(null);
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
            definition: {
              title: data.title,
              description: data.description,
              items: data.items.filter((i) => i.trim() !== ""),
            },
          }),
        },
      );
      const result = await res.json();
      if (result.success) {
        onSaved();
        setEditingDefinition(false);
      } else {
        setDefError(result.error || "Failed to save");
      }
    } catch {
      setDefError("Failed to save. Please try again.");
    } finally {
      setDefSaving(false);
    }
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
      .map((e) => ({ ...e, link: normalizeUrl(e.link) }));
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
      className={`border rounded-4 overflow-hidden mb-4 ${editingDefinition ? "border-primary border-2" : "border border-2"}`}
    >
      <div className="bg-secondary d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-1 px-3 px-sm-4 py-3">
        <h5 className="fw-bold mb-0 text-light">{milestone.title}</h5>
        <Stack
          direction="horizontal"
          gap={2}
          className="align-items-center flex-shrink-0"
        >
          {isManager && (
            <div className="d-flex align-items-center">
              <InfoTooltip
                position={{ top: true }}
                content={
                  editsUnlocked ? (
                    <span>
                      Milestone edits are unlocked. Communicate any changes to
                      your round admin.
                    </span>
                  ) : (
                    <span>
                      Milestone edits are locked. Contact your round admin if
                      you need to make changes.
                    </span>
                  )
                }
                target={
                  <Image
                    src={editsUnlocked ? "/unlock.svg" : "/lock.svg"}
                    alt={editsUnlocked ? "Edits unlocked" : "Edits locked"}
                    width={14}
                    height={14}
                    className="icon-invert"
                    style={{ cursor: "pointer" }}
                  />
                }
              />
            </div>
          )}
          <span
            className="fs-sm fw-semi-bold text-light text-nowrap rounded-pill px-3 py-1"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            {badgeLabel}
          </span>
          {isManager &&
            editsUnlocked &&
            !editingDefinition &&
            !isProgressEditing && (
              <Button
                variant="outline-light"
                size="sm"
                className="rounded-3 d-flex align-items-center gap-1 flex-shrink-0"
                onClick={handleEditDefinitionClick}
              >
                <Image
                  src="/edit.svg"
                  alt=""
                  width={14}
                  height={14}
                  className="icon-invert"
                />
                <span className="d-none d-sm-inline">Edit Milestone</span>
              </Button>
            )}
        </Stack>
      </div>
      <div className="p-3 p-sm-4" style={{ backgroundColor: "#fff" }}>
        {editingDefinition ? (
          <>
            {defError && <p className="text-danger small mb-3">{defError}</p>}
            <DefinitionEditForm
              milestone={milestone}
              onCancel={() => {
                setEditingDefinition(false);
                setDefError(null);
              }}
              onSave={handleDefinitionSave}
              saving={defSaving}
            />
          </>
        ) : (
          <>
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
                        {isManager && !isEditing && !editingDefinition && (
                          <Button
                            variant="outline-primary"
                            size="sm"
                            className="rounded-3 d-flex align-items-center gap-1 flex-shrink-0"
                            onClick={() => handleEditDeliverableClick(i)}
                          >
                            <Image
                              src="/edit.svg"
                              alt=""
                              width={14}
                              height={14}
                            />
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
              {isManager && !editingOtherDetails && !editingDefinition && (
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
          </>
        )}
      </div>
    </div>
  );
}
