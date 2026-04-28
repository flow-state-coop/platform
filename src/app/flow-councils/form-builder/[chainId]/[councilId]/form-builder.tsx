"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "react-bootstrap/Nav";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import Stack from "react-bootstrap/Stack";
import Collapse from "react-bootstrap/Collapse";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Image from "react-bootstrap/Image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useRequireAuth from "@/hooks/requireAuth";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import MarkdownEditor from "@/components/MarkdownEditor";
import {
  type FormElement,
  type FormSchema,
  STRUCTURAL_TYPES,
  MINIMAL_TEMPLATE,
  GOODBUILDERS_TEMPLATE,
} from "@/app/flow-councils/types/formSchema";

type Props = {
  chainId: number;
  councilId: string;
};

function confirmDestructive(message: string): boolean {
  return window.confirm(message);
}

const WALLET_ELEMENT_ID = "__wallet__";
const WALLET_ELEMENT: FormElement = {
  id: WALLET_ELEMENT_ID,
  type: "ethAddress",
  label: "Wallet to receive funding",
  required: true,
  placeholder: "0x...",
};

type ActiveTab = "project" | "round" | "attestation";
type MobileView = "editor" | "preview";

function newQuestion(type: FormElement["type"]): FormElement {
  const base = { id: crypto.randomUUID(), label: "" };

  switch (type) {
    case "section":
    case "divider":
      return { ...base, type };
    case "description":
      return { ...base, type, content: "" };
    case "select":
    case "multiSelect":
      return { ...base, type, required: false, options: [""] };
    case "textarea":
      return { ...base, type, required: false, markdown: true };
    case "number":
      return { ...base, type, required: false };
    case "ethAddress":
      return { ...base, type, required: false, placeholder: "0x..." };
    case "milestone":
      return {
        ...base,
        type,
        required: true,
        milestoneLabel: "Milestone",
        itemLabel: "Deliverable",
        minCount: 1,
      };
    default:
      return { ...base, type, required: false } as FormElement;
  }
}

const QUESTION_TYPES: { value: FormElement["type"]; label: string }[] = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Single Choice" },
  { value: "multiSelect", label: "Multiple Choice" },
  { value: "boolean", label: "Yes / No" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "ethAddress", label: "ETH Address" },
  { value: "milestone", label: "Milestone" },
];

const STRUCTURE_TYPES: { value: FormElement["type"]; label: string }[] = [
  { value: "section", label: "Heading" },
  { value: "description", label: "Text" },
  { value: "divider", label: "Dividing Line" },
];

const COLOR_STANDARD = "#3c655b";
const COLOR_COMMS = "#056589";
const COLOR_STRUCTURAL = "#888888";

const TYPE_COLORS: Record<FormElement["type"], string> = {
  text: COLOR_STANDARD,
  textarea: COLOR_STANDARD,
  number: COLOR_STANDARD,
  select: COLOR_STANDARD,
  multiSelect: COLOR_STANDARD,
  boolean: COLOR_STANDARD,
  milestone: COLOR_STANDARD,
  url: COLOR_COMMS,
  email: COLOR_COMMS,
  telegram: COLOR_COMMS,
  ethAddress: COLOR_COMMS,
  section: COLOR_STRUCTURAL,
  description: COLOR_STRUCTURAL,
  divider: COLOR_STRUCTURAL,
};

const TYPE_DISPLAY_NAMES: Record<FormElement["type"], string> = {
  section: "Heading",
  description: "Text",
  text: "Text",
  textarea: "Text Area",
  number: "Number",
  url: "URL",
  email: "Email",
  select: "Select",
  multiSelect: "Multi Select",
  boolean: "Yes/No",
  telegram: "Telegram",
  ethAddress: "ETH Address",
  milestone: "Milestone",
  divider: "Dividing Line",
};

const PROJECT_FIELDS = [
  { section: "Admin", fields: ["Project Name", "Manager Addresses"] },
  {
    section: "Basics",
    fields: ["Description", "Logo", "Banner", "Website", "Demo URL"],
  },
  {
    section: "Social",
    fields: [
      "X/Twitter",
      "Farcaster",
      "Telegram",
      "Discord",
      "Karma Profile",
      "Gardens Pool",
    ],
  },
  { section: "Technical", fields: ["GitHub Repos", "Smart Contracts"] },
  { section: "Additional", fields: ["Other Links"] },
];

const pillStyle = (isActive: boolean) => ({
  backgroundColor: isActive ? "#3c655b" : "transparent",
  color: isActive ? "#fff" : "#030303",
  borderRadius: "0.5rem",
  fontWeight: isActive ? 700 : 300,
  padding: "0.4rem 1rem",
  transition: "all 0.15s ease-in-out",
});

const subtleButtonStyle = {
  backgroundColor: "rgba(60, 101, 91, 0.1)",
  color: "#3c655b",
  border: "1px solid rgba(60, 101, 91, 0.25)",
  borderRadius: "0.5rem",
  padding: "0.1rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  lineHeight: 1.5,
};

const colorDotStyle = (color: string) => ({
  width: 10,
  height: 10,
  borderRadius: "50%",
  backgroundColor: color,
  display: "inline-block",
  flexShrink: 0,
});

const dragHandleStyle = {
  cursor: "grab",
  padding: "0.1rem 0.25rem",
  color: "#aaa",
  fontSize: "1rem",
  lineHeight: 1,
  flexShrink: 0,
  touchAction: "none" as const,
};

function ElementCard({
  element,
  index,
  total,
  error,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  element: FormElement;
  index: number;
  total: number;
  error?: string;
  onUpdate: (el: FormElement) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(
    !element.label &&
      element.type !== "description" &&
      element.type !== "divider",
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  const style = {
    borderRadius: 4,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const typeColor = error
    ? "#dc3545"
    : (TYPE_COLORS[element.type] ?? "#888888");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-3 bg-white p-3 position-relative overflow-hidden"
    >
      <div
        className="position-absolute top-0 start-0 h-100"
        style={{ width: 6, backgroundColor: typeColor }}
      />
      <div
        className="d-flex align-items-center justify-content-between"
        style={{ cursor: element.type === "divider" ? "default" : "pointer" }}
        onClick={() => {
          if (element.type !== "divider") setExpanded(!expanded);
        }}
      >
        <div className="d-flex align-items-center gap-2 overflow-hidden">
          <span
            style={dragHandleStyle}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
          <span
            className="badge rounded-pill flex-shrink-0 fs-xxs text-white"
            style={{ backgroundColor: typeColor }}
          >
            {TYPE_DISPLAY_NAMES[element.type] ?? element.type}
          </span>
          {element.type !== "divider" && (
            <span className="text-truncate fs-sm">
              {element.label || "(untitled)"}
            </span>
          )}
        </div>
        <div className="d-flex gap-1 flex-shrink-0 ms-2 align-items-center">
          <button
            type="button"
            style={subtleButtonStyle}
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
          >
            ↑
          </button>
          <button
            type="button"
            style={subtleButtonStyle}
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
          >
            ↓
          </button>
          <Button
            variant="link"
            className="p-0 ms-1 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Image src="/close.svg" alt="Remove" width={24} height={24} />
          </Button>
        </div>
      </div>
      {error && !expanded && (
        <span className="text-danger fs-xxs d-block mt-1">{error}</span>
      )}
      <Collapse in={expanded}>
        <div>
          <hr className="my-2" style={{ opacity: 0.15 }} />
          {element.type !== "description" && element.type !== "divider" && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">Label</Form.Label>
              <Form.Control
                type="text"
                className="rounded-3"
                value={element.label}
                onChange={(e) =>
                  onUpdate({ ...element, label: e.target.value })
                }
                placeholder="Question or heading text"
              />
            </Form.Group>
          )}

          {element.type === "description" && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">Content</Form.Label>
              <MarkdownEditor
                value={element.content}
                onChange={(e) =>
                  onUpdate({ ...element, content: e.target.value })
                }
                placeholder="Descriptive text (supports markdown)"
                rows={3}
              />
            </Form.Group>
          )}

          {"required" in element && element.type !== "milestone" && (
            <Form.Check
              type="checkbox"
              label="Required"
              checked={element.required ?? false}
              onChange={(e) =>
                onUpdate({
                  ...element,
                  required: e.target.checked,
                } as FormElement)
              }
              className="mb-3"
            />
          )}

          {"placeholder" in element && element.type !== "textarea" && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">
                Placeholder
              </Form.Label>
              <Form.Control
                type="text"
                className="rounded-3"
                value={(element as { placeholder?: string }).placeholder ?? ""}
                onChange={(e) =>
                  onUpdate({
                    ...element,
                    placeholder: e.target.value,
                  } as FormElement)
                }
              />
            </Form.Group>
          )}

          {element.type === "textarea" && (
            <>
              <Form.Group className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
                  Placeholder
                </Form.Label>
                <Form.Control
                  type="text"
                  className="rounded-3"
                  value={element.placeholder ?? ""}
                  onChange={(e) =>
                    onUpdate({ ...element, placeholder: e.target.value })
                  }
                />
              </Form.Group>
              <Stack direction="horizontal" gap={3} className="mb-3">
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Min Characters
                  </Form.Label>
                  <Form.Control
                    type="number"
                    className="rounded-3"
                    value={element.minCharLimit ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        ...element,
                        minCharLimit: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="None"
                  />
                </Form.Group>
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Max Characters
                  </Form.Label>
                  <Form.Control
                    type="number"
                    className="rounded-3"
                    value={element.charLimit ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        ...element,
                        charLimit: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="None"
                  />
                </Form.Group>
              </Stack>
              <Form.Check
                type="checkbox"
                label="Enable Markdown Editor"
                checked={element.markdown !== false}
                onChange={(e) =>
                  onUpdate({ ...element, markdown: e.target.checked })
                }
                className="mb-3"
              />
            </>
          )}

          {element.type === "milestone" && (
            <>
              <Stack direction="horizontal" gap={3} className="mb-3">
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Milestone Label
                  </Form.Label>
                  <Form.Control
                    type="text"
                    className="rounded-3"
                    value={element.milestoneLabel ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        ...element,
                        milestoneLabel: e.target.value,
                      })
                    }
                    placeholder="Milestone"
                  />
                </Form.Group>
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Sub-item Label
                  </Form.Label>
                  <Form.Control
                    type="text"
                    className="rounded-3"
                    value={element.itemLabel ?? ""}
                    onChange={(e) =>
                      onUpdate({ ...element, itemLabel: e.target.value })
                    }
                    placeholder="Deliverable"
                  />
                </Form.Group>
              </Stack>
              <Form.Group className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
                  Minimum Count
                </Form.Label>
                <Form.Control
                  type="number"
                  className="rounded-3"
                  min={1}
                  max={5}
                  value={element.minCount ?? 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    const clamped = Math.max(1, Math.min(5, Math.round(n)));
                    onUpdate({ ...element, minCount: clamped });
                  }}
                />
                <Form.Text className="text-muted">
                  Applicants must complete at least this many milestones (1–5).
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
                  Description Placeholder
                </Form.Label>
                <Form.Control
                  type="text"
                  className="rounded-3"
                  value={element.descriptionPlaceholder ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      ...element,
                      descriptionPlaceholder: e.target.value || undefined,
                    })
                  }
                />
              </Form.Group>
              <Stack direction="horizontal" gap={3} className="mb-3">
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Description Min Characters
                  </Form.Label>
                  <Form.Control
                    type="number"
                    className="rounded-3"
                    min={0}
                    value={element.descriptionMinChars ?? ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        onUpdate({
                          ...element,
                          descriptionMinChars: undefined,
                        });
                        return;
                      }
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      onUpdate({
                        ...element,
                        descriptionMinChars: Math.max(0, Math.round(n)),
                      });
                    }}
                    placeholder="None"
                  />
                </Form.Group>
                <Form.Group className="flex-grow-1">
                  <Form.Label className="fs-sm fw-semi-bold">
                    Description Max Characters
                  </Form.Label>
                  <Form.Control
                    type="number"
                    className="rounded-3"
                    min={1}
                    value={element.descriptionMaxChars ?? ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        onUpdate({
                          ...element,
                          descriptionMaxChars: undefined,
                        });
                        return;
                      }
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      onUpdate({
                        ...element,
                        descriptionMaxChars: Math.max(1, Math.round(n)),
                      });
                    }}
                    placeholder="None"
                  />
                </Form.Group>
              </Stack>
            </>
          )}

          {element.type === "url" && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">
                Base URL (optional)
              </Form.Label>
              <Form.Control
                type="text"
                className="rounded-3"
                value={element.baseUrl ?? ""}
                onChange={(e) =>
                  onUpdate({
                    ...element,
                    baseUrl: e.target.value || undefined,
                  })
                }
                placeholder="e.g. https://github.com/"
              />
              <Form.Text className="text-muted">
                Responses must start with this URL
              </Form.Text>
            </Form.Group>
          )}

          {element.type === "number" && (
            <Stack direction="horizontal" gap={3} className="mb-3">
              <Form.Group>
                <Form.Label className="fs-sm fw-semi-bold">Min</Form.Label>
                <Form.Control
                  type="number"
                  className="rounded-3"
                  value={element.min ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      ...element,
                      min: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Form.Group>
              <Form.Group>
                <Form.Label className="fs-sm fw-semi-bold">Max</Form.Label>
                <Form.Control
                  type="number"
                  className="rounded-3"
                  value={element.max ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      ...element,
                      max: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Form.Group>
            </Stack>
          )}

          {(element.type === "select" || element.type === "multiSelect") && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">Options</Form.Label>
              {element.options.map((opt, i) => (
                <Stack key={i} direction="horizontal" gap={2} className="mb-2">
                  <Form.Control
                    type="text"
                    className="rounded-3"
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...element.options];
                      newOpts[i] = e.target.value;
                      onUpdate({ ...element, options: newOpts });
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  {element.options.length > 1 && (
                    <Button
                      variant="link"
                      className="p-0 flex-shrink-0"
                      onClick={() =>
                        onUpdate({
                          ...element,
                          options: element.options.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Image
                        src="/close.svg"
                        alt="Remove"
                        width={24}
                        height={24}
                      />
                    </Button>
                  )}
                </Stack>
              ))}
              <Button
                variant="link"
                className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
                onClick={() =>
                  onUpdate({
                    ...element,
                    options: [...element.options, ""],
                  })
                }
              >
                Add option
              </Button>
            </Form.Group>
          )}
        </div>
      </Collapse>
    </div>
  );
}

function ProjectFieldsContent() {
  return (
    <>
      {PROJECT_FIELDS.map((group) => (
        <div key={group.section} className="mb-3">
          <span className="fw-semi-bold d-block mb-2">{group.section}</span>
          <div className="d-flex flex-wrap gap-2">
            {group.fields.map((field) => (
              <span
                key={field}
                className="rounded-pill"
                style={{
                  backgroundColor: "rgba(60, 101, 91, 0.1)",
                  color: "#3c655b",
                  border: "1px solid rgba(60, 101, 91, 0.25)",
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.875rem",
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="text-info fs-sm mb-0 mt-4">
        Project fields are standardized and public.
      </p>
    </>
  );
}

function ProjectFieldsPreview() {
  return (
    <Form>
      <h6 className="fw-semi-bold mb-2">Admin</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Project Name*</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">
          Manager Addresses*
        </Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <h6 className="fw-semi-bold mt-4 mb-2">Basics</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Description*</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          disabled
          className="rounded-3"
          placeholder="200–5000 characters"
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Logo*</Form.Label>
        <Form.Control
          type="text"
          disabled
          className="rounded-3"
          placeholder="1:1 image upload"
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Banner*</Form.Label>
        <Form.Control
          type="text"
          disabled
          className="rounded-3"
          placeholder="3:1 image upload"
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Website*</Form.Label>
        <Form.Control type="url" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Demo URL</Form.Label>
        <Form.Control type="url" disabled className="rounded-3" />
      </Form.Group>
      <h6 className="fw-semi-bold mt-4 mb-2">Social</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">X/Twitter</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Farcaster</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Telegram</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Discord</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <h6 className="fw-semi-bold mt-4 mb-2">Technical</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">GitHub Repos*</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <h6 className="fw-semi-bold mt-4 mb-2">Additional</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Other Links</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
    </Form>
  );
}

export default function FormBuilder({ chainId, councilId }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("round");
  const [schema, setSchema] = useState<FormSchema>({
    round: [],
    attestation: [],
  });
  const [dirty, setDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("editor");
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const router = useRouter();
  const { isMobile } = useMediaQuery();
  const { requireAuth } = useRequireAuth();

  const fetchSchema = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/flow-council/rounds/form-schema?chainId=${chainId}&flowCouncilAddress=${councilId}`,
      );
      const data = await res.json();

      if (data.success && data.formSchema) {
        setSchema(data.formSchema);
        setDirty(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [chainId, councilId]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const elements = useMemo(() => {
    if (activeTab === "project") return [];
    if (activeTab === "round") return [WALLET_ELEMENT, ...schema.round];
    return schema.attestation;
  }, [activeTab, schema.round, schema.attestation]);

  const updateElements = (newElements: FormElement[]) => {
    if (activeTab === "project") return;
    if (activeTab === "round") {
      setSchema((prev) => ({
        ...prev,
        round: newElements.filter((el) => el.id !== WALLET_ELEMENT_ID),
      }));
    } else {
      setSchema((prev) => ({ ...prev, [activeTab]: newElements }));
    }
    setDirty(true);
  };

  const handleAdd = (type: FormElement["type"]) => {
    updateElements([...elements, newQuestion(type)]);
  };

  const handleUpdate = (index: number, element: FormElement) => {
    const newElements = [...elements];
    newElements[index] = element;
    updateElements(newElements);
  };

  const handleRemove = (index: number) => {
    const element = elements[index];
    if (
      !STRUCTURAL_TYPES.has(element.type) &&
      !confirmDestructive("Delete this question?")
    ) {
      return;
    }
    updateElements(elements.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= elements.length) return;
    const newElements = [...elements];
    [newElements[index], newElements[target]] = [
      newElements[target],
      newElements[index],
    ];
    updateElements(newElements);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = elements.findIndex((el) => el.id === active.id);
    const newIndex = elements.findIndex((el) => el.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    updateElements(arrayMove(elements, oldIndex, newIndex));
  };

  const sortableIds = useMemo(
    () =>
      elements.filter((el) => el.id !== WALLET_ELEMENT_ID).map((el) => el.id),
    [elements],
  );

  const handleTemplate = (template: FormSchema) => {
    const hasItems = schema.round.length > 0 || schema.attestation.length > 0;
    if (
      hasItems &&
      !confirmDestructive("Replace current form with template?")
    ) {
      return;
    }
    setSchema(template);
    setDirty(true);
  };

  const validateElements = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const allElements = [...schema.round, ...schema.attestation];
    for (const el of allElements) {
      if (el.id === WALLET_ELEMENT_ID) continue;
      if (el.type === "divider") continue;
      if (el.type === "description") {
        if (!el.content?.trim()) {
          errors[el.id] = "Text requires content";
        }
      } else if (el.type === "select" || el.type === "multiSelect") {
        if (!el.label.trim()) {
          errors[el.id] = "Label is required";
        } else if (!el.options.some((o) => o.trim())) {
          errors[el.id] = "At least one non-empty option is required";
        }
      } else if (!el.label.trim()) {
        errors[el.id] = "Label is required";
      }
    }
    return errors;
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");

    const errors = validateElements();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const count = Object.keys(errors).length;
      setError(
        `Please fix ${count} issue${count > 1 ? "s" : ""} before saving`,
      );
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/flow-council/rounds/form-schema", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          flowCouncilAddress: councilId,
          formSchema: schema,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setDirty(false);
        setSuccess("Form schema saved");
      } else {
        setError(data.error || "Failed to save");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={`justify-content-center align-items-center ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
        >
          <Spinner />
        </Stack>
      </>
    );
  }

  const walletOffset = activeTab === "round" ? 1 : 0;

  const editorContent = (
    <>
      {elements.filter((el) => el.id !== WALLET_ELEMENT_ID).length === 0 && (
        <p className="text-info fs-sm">
          No items yet. Add questions or use a template to get started.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {elements
            .filter((el) => el.id !== WALLET_ELEMENT_ID)
            .map((element, index) => (
              <ElementCard
                key={element.id}
                element={element}
                index={index}
                total={elements.length - walletOffset}
                error={validationErrors[element.id]}
                onUpdate={(el) => handleUpdate(index + walletOffset, el)}
                onRemove={() => handleRemove(index + walletOffset)}
                onMoveUp={() => move(index + walletOffset, -1)}
                onMoveDown={() => move(index + walletOffset, 1)}
              />
            ))}
        </SortableContext>
      </DndContext>

      <Stack direction="horizontal" gap={2} className="mt-3">
        <Dropdown>
          <Dropdown.Toggle variant="secondary" size="sm" className="rounded-3">
            Add Question
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {QUESTION_TYPES.map((qt) => (
              <Dropdown.Item
                key={qt.value}
                onClick={() => handleAdd(qt.value)}
                className="d-flex align-items-center gap-2"
              >
                <span style={colorDotStyle(TYPE_COLORS[qt.value])} />
                {qt.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Dropdown>
          <Dropdown.Toggle
            variant="transparent"
            size="sm"
            className="rounded-3 text-info"
          >
            Add Structure
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {STRUCTURE_TYPES.map((st) => (
              <Dropdown.Item
                key={st.value}
                onClick={() => handleAdd(st.value)}
                className="d-flex align-items-center gap-2"
              >
                <span style={colorDotStyle(TYPE_COLORS[st.value])} />
                {st.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Dropdown className="ms-auto">
          <Dropdown.Toggle
            variant="outline-secondary"
            size="sm"
            className="rounded-3"
          >
            Start from Template
          </Dropdown.Toggle>
          <Dropdown.Menu align="end">
            <Dropdown.Item onClick={() => handleTemplate(MINIMAL_TEMPLATE)}>
              Minimal
            </Dropdown.Item>
            <Dropdown.Item
              onClick={() => handleTemplate(GOODBUILDERS_TEMPLATE)}
            >
              GoodBuilders
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
    </>
  );

  const tabNav = (
    <Nav
      variant="pills"
      activeKey={activeTab}
      onSelect={(k) => k && setActiveTab(k as ActiveTab)}
      className="mb-3 gap-1"
    >
      <Nav.Item>
        <Nav.Link eventKey="project" style={pillStyle(activeTab === "project")}>
          Project
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="round" style={pillStyle(activeTab === "round")}>
          Round
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link
          eventKey="attestation"
          style={pillStyle(activeTab === "attestation")}
        >
          Attestation
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );

  const previewPane = (
    <Card className="bg-lace-100 rounded-4 border-0 p-4">
      <span className="fw-semi-bold d-block mb-3">Preview</span>
      <div className="bg-white rounded-3 p-3">
        {activeTab === "project" ? (
          <ProjectFieldsPreview />
        ) : (
          <FormPreview
            elements={elements}
            validationErrors={validationErrors}
          />
        )}
      </div>
    </Card>
  );

  const cardHeader = (
    <>
      <div className="mb-3">
        <h5 className="fw-semi-bold mb-1">Form Builder</h5>
        <span className="text-info fs-sm">
          Configure the questions applicants answer when applying to your round
        </span>
      </div>
      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          variant="success"
          dismissible
          onClose={() => setSuccess("")}
          className="mb-3"
        >
          {success}
        </Alert>
      )}
    </>
  );

  const mobileToggleButtonStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? "#3c655b" : "#fff",
    color: isActive ? "#fff" : "#3c655b",
    fontWeight: isActive ? 700 : 500,
    border: "none",
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
  });

  const mobileViewToggle = (
    <ButtonGroup className="mb-3 w-100">
      <Button
        style={{
          ...mobileToggleButtonStyle(mobileView === "editor"),
          borderRadius: "0.5rem 0 0 0.5rem",
        }}
        onClick={() => setMobileView("editor")}
      >
        Editor
      </Button>
      <Button
        style={{
          ...mobileToggleButtonStyle(mobileView === "preview"),
          borderRadius: "0 0.5rem 0.5rem 0",
        }}
        onClick={() => setMobileView("preview")}
      >
        Preview
      </Button>
    </ButtonGroup>
  );

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={`pb-5 ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
      >
        {isMobile ? (
          <>
            {mobileViewToggle}
            <Card className="bg-lace-100 rounded-4 border-0 p-4">
              {cardHeader}
              {tabNav}
              {mobileView === "editor" ? (
                activeTab === "project" ? (
                  <ProjectFieldsContent />
                ) : (
                  editorContent
                )
              ) : (
                <div className="bg-white rounded-3 p-3">
                  {activeTab === "project" ? (
                    <ProjectFieldsPreview />
                  ) : (
                    <FormPreview
                      elements={elements}
                      validationErrors={validationErrors}
                    />
                  )}
                </div>
              )}
            </Card>
          </>
        ) : (
          <div className="d-flex gap-4 align-items-start">
            <Card
              className="bg-lace-100 rounded-4 border-0 p-4 flex-grow-1"
              style={{ minWidth: 0 }}
            >
              {cardHeader}
              {tabNav}
              {activeTab === "project" ? (
                <ProjectFieldsContent />
              ) : (
                editorContent
              )}
            </Card>
            <div
              className="flex-shrink-0 position-sticky"
              style={{ width: "45%", top: "1rem" }}
            >
              {previewPane}
            </div>
          </div>
        )}
        <div className="d-grid gap-3 mt-4">
          <Button
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() => requireAuth(handleSave)}
            disabled={isSaving}
          >
            {isSaving ? <Spinner size="sm" /> : "Save"}
          </Button>
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() => {
              if (
                dirty &&
                !confirmDestructive(
                  "You have unsaved changes to the form. Leave without saving?",
                )
              ) {
                return;
              }
              router.push(`/flow-councils/review/${chainId}/${councilId}`);
            }}
          >
            Next
          </Button>
        </div>
      </Stack>
    </>
  );
}

function computeNumbering(elements: FormElement[]) {
  let sectionIndex = 0;
  let questionIndex = 0;
  const hasSections = elements.some((el) => el.type === "section");
  const numberMap = new Map<string, string>();
  for (const el of elements) {
    if (el.type === "section") {
      sectionIndex++;
      questionIndex = 0;
    } else if (
      el.type !== "description" &&
      el.type !== "divider" &&
      el.id !== WALLET_ELEMENT_ID
    ) {
      questionIndex++;
      numberMap.set(
        el.id,
        hasSections ? `${sectionIndex}.${questionIndex}` : `${questionIndex}`,
      );
    }
  }
  return numberMap;
}

function FormPreview({
  elements,
  validationErrors = {},
}: {
  elements: FormElement[];
  validationErrors?: Record<string, string>;
}) {
  if (elements.length === 0) {
    return <p className="text-info fs-sm">No items to preview.</p>;
  }

  const errorStyle = (id: string) =>
    validationErrors[id]
      ? { borderLeft: "4px solid #dc3545", paddingLeft: 8 }
      : {};

  const numberMap = computeNumbering(elements);
  const num = (id: string) => {
    const n = numberMap.get(id);
    return n ? `${n}. ` : "";
  };

  return (
    <Form>
      {elements.map((el) => {
        switch (el.type) {
          case "section":
            return (
              <h5
                key={el.id}
                className="fw-semi-bold mt-3 mb-2"
                style={errorStyle(el.id)}
              >
                {el.label || "(Heading)"}
              </h5>
            );
          case "description":
            return (
              <p
                key={el.id}
                className="text-info fs-sm mb-2"
                style={errorStyle(el.id)}
              >
                {el.content || el.label || "(Text)"}
              </p>
            );
          case "divider":
            return (
              <hr key={el.id} className="my-3" style={errorStyle(el.id)} />
            );
          case "text":
          case "email":
          case "telegram":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type={el.type === "telegram" ? "text" : el.type}
                  disabled
                  className="rounded-3"
                  placeholder={
                    "placeholder" in el
                      ? (el.placeholder ?? undefined)
                      : undefined
                  }
                />
              </Form.Group>
            );
          case "ethAddress": {
            const isWallet = el.id === WALLET_ELEMENT_ID;
            const group = (
              <Form.Group
                key={el.id}
                className={isWallet ? "mb-0" : "mb-3"}
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {!isWallet && num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="text"
                  disabled
                  className="rounded-3"
                  placeholder={el.placeholder ?? "0x..."}
                />
              </Form.Group>
            );
            return isWallet ? (
              <div
                key={el.id}
                className="rounded-4 p-3 mb-3 border border-2"
                style={
                  {
                    backgroundColor: "#f0f4f0",
                    "--bs-border-color": "#3c655b",
                  } as React.CSSProperties
                }
              >
                {group}
              </div>
            ) : (
              group
            );
          }
          case "url":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                {el.baseUrl && (
                  <Form.Text className="text-muted d-block mb-1">
                    Must start with {el.baseUrl}
                  </Form.Text>
                )}
                <Form.Control
                  type="url"
                  disabled
                  className="rounded-3"
                  placeholder={el.placeholder ?? el.baseUrl ?? undefined}
                />
              </Form.Group>
            );
          case "textarea": {
            const limits: string[] = [];
            if (el.minCharLimit) limits.push(`Min ${el.minCharLimit}`);
            if (el.charLimit) limits.push(`Max ${el.charLimit}`);
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                  {el.markdown !== false && (
                    <Badge bg="secondary" className="ms-2 fw-normal fs-xxs">
                      Markdown
                    </Badge>
                  )}
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  disabled
                  className="rounded-3"
                  placeholder={el.placeholder ?? undefined}
                />
                {limits.length > 0 && (
                  <Form.Text className="text-muted">
                    {limits.join(" / ")} characters
                  </Form.Text>
                )}
              </Form.Group>
            );
          }
          case "number":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="number"
                  disabled
                  className="rounded-3"
                  min={el.min}
                  max={el.max}
                />
              </Form.Group>
            );
          case "select":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                {el.options.map((opt, i) => (
                  <Form.Check
                    key={i}
                    type="radio"
                    label={opt || `Option ${i + 1}`}
                    disabled
                  />
                ))}
              </Form.Group>
            );
          case "multiSelect":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                {el.options.map((opt, i) => (
                  <Form.Check
                    key={i}
                    type="checkbox"
                    label={opt || `Option ${i + 1}`}
                    disabled
                  />
                ))}
              </Form.Group>
            );
          case "boolean":
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="horizontal" gap={3}>
                  <Form.Check type="radio" label="Yes" disabled />
                  <Form.Check type="radio" label="No" disabled />
                </Stack>
              </Form.Group>
            );
          case "milestone": {
            const minCount = Math.max(1, Math.min(5, el.minCount ?? 1));
            const milestoneLabel = el.milestoneLabel || "Milestone";
            const itemLabel = el.itemLabel || "Deliverable";
            return (
              <Form.Group
                key={el.id}
                className="mb-3"
                style={errorStyle(el.id)}
              >
                <Form.Label className="fs-sm fw-semi-bold">
                  {num(el.id)}
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                {Array.from({ length: minCount }).map((_, i) => (
                  <div
                    key={i}
                    className="border rounded-3 p-2 mb-2"
                    style={{ backgroundColor: "#fafafa" }}
                  >
                    <span className="fw-semi-bold fs-sm d-block mb-1">
                      {milestoneLabel} {i + 1}
                    </span>
                    <Form.Control
                      type="text"
                      disabled
                      className="rounded-3 mb-2"
                      placeholder="Title"
                    />
                    <Form.Control
                      as="textarea"
                      rows={2}
                      disabled
                      className="rounded-3 mb-2"
                      placeholder={el.descriptionPlaceholder ?? "Description"}
                    />
                    <Form.Control
                      type="text"
                      disabled
                      className="rounded-3"
                      placeholder={itemLabel}
                    />
                  </div>
                ))}
                <Form.Text className="text-muted">
                  Minimum {minCount}; applicants can add more.
                </Form.Text>
              </Form.Group>
            );
          }
        }
      })}
    </Form>
  );
}
