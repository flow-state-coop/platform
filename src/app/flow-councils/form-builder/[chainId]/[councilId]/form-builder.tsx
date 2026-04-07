"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useMediaQuery } from "@/hooks/mediaQuery";
import useRequireAuth from "@/hooks/requireAuth";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import {
  type FormElement,
  type FormSchema,
  MINIMAL_TEMPLATE,
  GOODBUILDERS_TEMPLATE,
} from "@/app/flow-councils/types/formSchema";

type Props = {
  chainId: number;
  councilId: string;
};

type ActiveTab = "project" | "round" | "attestation";
type MobileView = "editor" | "preview";

function generateId() {
  return crypto.randomUUID();
}

function newQuestion(type: FormElement["type"]): FormElement {
  const base = { id: generateId(), label: "" };

  switch (type) {
    case "section":
    case "title":
      return { ...base, type };
    case "description":
      return { ...base, type, content: "" };
    case "select":
    case "multiSelect":
      return { ...base, type, required: false, options: [""] };
    case "textarea":
      return { ...base, type, required: false };
    case "number":
      return { ...base, type, required: false };
    default:
      return { ...base, type, required: false } as FormElement;
  }
}

const QUESTION_TYPES: { value: FormElement["type"]; label: string }[] = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "select", label: "Single Choice" },
  { value: "multiSelect", label: "Multiple Choice" },
  { value: "boolean", label: "Yes / No" },
  { value: "telegram", label: "Telegram" },
];

const STRUCTURE_TYPES: { value: FormElement["type"]; label: string }[] = [
  { value: "section", label: "Section Heading" },
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
];

const TYPE_COLORS: Record<string, string> = {
  section: "#3c655b",
  title: "#056589",
  description: "#888888",
  text: "#056589",
  textarea: "#49796b",
  number: "#d95d39",
  url: "#056589",
  email: "#056589",
  select: "#3c655b",
  multiSelect: "#3c655b",
  boolean: "#3c655b",
  telegram: "#056589",
};

const PROJECT_FIELDS = [
  {
    section: "Basics",
    fields: [
      "Project Name",
      "Description",
      "Logo",
      "Banner",
      "Website",
      "Demo URL",
    ],
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
  {
    section: "Funding",
    fields: ["Manager Addresses", "Manager Emails", "Default Funding Address"],
  },
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

function ElementCard({
  element,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  element: FormElement;
  index: number;
  total: number;
  onUpdate: (el: FormElement) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(!element.label);

  const typeColor = TYPE_COLORS[element.type] ?? "#888888";

  return (
    <div
      className="mb-3 bg-white p-3 position-relative overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div
        className="position-absolute top-0 start-0 h-100"
        style={{ width: 6, backgroundColor: typeColor }}
      />
      <div
        className="d-flex align-items-center justify-content-between"
        style={{ cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="d-flex align-items-center gap-2 overflow-hidden">
          <Badge
            pill
            className="text-capitalize flex-shrink-0 fs-xxs"
            style={{ backgroundColor: typeColor }}
          >
            {element.type}
          </Badge>
          <span className="text-truncate fs-sm">
            {element.label || "(untitled)"}
          </span>
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
            Up
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
            Down
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
      <Collapse in={expanded}>
        <div>
          <hr className="my-2" style={{ opacity: 0.15 }} />
          <Form.Group className="mb-3">
            <Form.Label className="fs-sm fw-semi-bold">Label</Form.Label>
            <Form.Control
              type="text"
              className="rounded-3"
              value={element.label}
              onChange={(e) => onUpdate({ ...element, label: e.target.value })}
              placeholder="Question or heading text"
            />
          </Form.Group>

          {element.type === "description" && (
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">Content</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                className="rounded-3"
                value={element.content}
                onChange={(e) =>
                  onUpdate({ ...element, content: e.target.value })
                }
                placeholder="Description text (supports markdown)"
              />
            </Form.Group>
          )}

          {"required" in element && (
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

          {"placeholder" in element && (
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
            <Form.Group className="mb-3">
              <Form.Label className="fs-sm fw-semi-bold">
                Character Limit
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
                placeholder="No limit"
              />
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
      <p className="text-info mb-4">
        These fields are collected from every applicant automatically.
      </p>
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
    </>
  );
}

function ProjectFieldsPreview() {
  return (
    <Form>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Project Name*</Form.Label>
        <Form.Control type="text" disabled className="rounded-3" />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">Description*</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          disabled
          className="rounded-3"
          placeholder="1000–5000 characters"
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
      <h6 className="fw-semi-bold mt-4 mb-2">Funding</h6>
      <Form.Group className="mb-3">
        <Form.Label className="fs-sm fw-semi-bold">
          Default Funding Address*
        </Form.Label>
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasApplications, setHasApplications] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("editor");

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

  const elements =
    activeTab === "project" ? [] : schema[activeTab as "round" | "attestation"];

  const updateElements = (newElements: FormElement[]) => {
    if (activeTab === "project") return;
    setSchema((prev) => ({ ...prev, [activeTab]: newElements }));
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
    updateElements(elements.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newElements = [...elements];
    [newElements[index - 1], newElements[index]] = [
      newElements[index],
      newElements[index - 1],
    ];
    updateElements(newElements);
  };

  const handleMoveDown = (index: number) => {
    if (index === elements.length - 1) return;
    const newElements = [...elements];
    [newElements[index], newElements[index + 1]] = [
      newElements[index + 1],
      newElements[index],
    ];
    updateElements(newElements);
  };

  const handleTemplate = (template: FormSchema) => {
    const hasItems = schema.round.length > 0 || schema.attestation.length > 0;
    if (hasItems && !window.confirm("Replace current form with template?")) {
      return;
    }
    setSchema(template);
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const res = await fetch("/api/flow-council/rounds/form-schema", {
        method: "PUT",
        body: JSON.stringify({
          chainId,
          flowCouncilAddress: councilId,
          formSchema: schema,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess("Form schema saved");
        setHasApplications(data.hasApplications);
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

  const editorContent = (
    <>
      {elements.length === 0 && (
        <p className="text-info fs-sm">
          No items yet. Add questions or use a template to get started.
        </p>
      )}

      {elements.map((element, index) => (
        <ElementCard
          key={element.id}
          element={element}
          index={index}
          total={elements.length}
          onUpdate={(el) => handleUpdate(index, el)}
          onRemove={() => handleRemove(index)}
          onMoveUp={() => handleMoveUp(index)}
          onMoveDown={() => handleMoveDown(index)}
        />
      ))}

      <Stack direction="horizontal" gap={2} className="mt-3">
        <Dropdown>
          <Dropdown.Toggle variant="secondary" size="sm" className="rounded-3">
            Add Question
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {QUESTION_TYPES.map((qt) => (
              <Dropdown.Item key={qt.value} onClick={() => handleAdd(qt.value)}>
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
              <Dropdown.Item key={st.value} onClick={() => handleAdd(st.value)}>
                {st.label}
              </Dropdown.Item>
            ))}
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
          <FormPreview elements={elements} />
        )}
      </div>
    </Card>
  );

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={`pb-5 ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4 mb-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Stack
              direction="horizontal"
              gap={3}
              className="justify-content-between flex-wrap"
            >
              <div>
                <h5 className="fw-semi-bold mb-1">Application Form</h5>
                <span className="text-info fs-sm">
                  Configure the questions applicants answer when applying to
                  your round
                </span>
              </div>
              <Stack direction="horizontal" gap={2}>
                <Dropdown>
                  <Dropdown.Toggle
                    variant="secondary"
                    size="sm"
                    className="rounded-3"
                  >
                    Start from Template
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item
                      onClick={() => handleTemplate(MINIMAL_TEMPLATE)}
                    >
                      Minimal
                    </Dropdown.Item>
                    <Dropdown.Item
                      onClick={() => handleTemplate(GOODBUILDERS_TEMPLATE)}
                    >
                      GoodBuilders
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
                <Button
                  onClick={() => requireAuth(handleSave)}
                  disabled={isSaving}
                  size="sm"
                  className="rounded-3"
                >
                  {isSaving ? <Spinner size="sm" /> : "Save"}
                </Button>
              </Stack>
            </Stack>
          </Card.Header>

          {(error || success || hasApplications) && (
            <Card.Body className="p-0 mt-3">
              {error && (
                <Alert variant="danger" className="mb-0">
                  {error}
                </Alert>
              )}
              {success && (
                <Alert
                  variant="success"
                  dismissible
                  onClose={() => setSuccess("")}
                  className="mb-0"
                >
                  {success}
                </Alert>
              )}
              {hasApplications && (
                <Alert variant="warning" className="mb-0 mt-2">
                  Applications already exist. Adding required questions may
                  require applicants to update.
                </Alert>
              )}
            </Card.Body>
          )}
        </Card>

        {isMobile ? (
          <Card className="bg-lace-100 rounded-4 border-0 p-4">
            <span className="fw-semi-bold d-block mb-3">Form Builder</span>
            {tabNav}
            {activeTab === "project" ? (
              <ProjectFieldsContent />
            ) : (
              <>
                <ButtonGroup className="mb-3">
                  <Button
                    size="sm"
                    className="border-0"
                    style={{
                      backgroundColor:
                        mobileView === "editor"
                          ? "rgba(60, 101, 91, 0.15)"
                          : "transparent",
                      color: mobileView === "editor" ? "#3c655b" : "#6c757d",
                      borderRadius: "0.5rem 0 0 0.5rem",
                      fontWeight: mobileView === "editor" ? 600 : 400,
                    }}
                    onClick={() => setMobileView("editor")}
                  >
                    Editor
                  </Button>
                  <Button
                    size="sm"
                    className="border-0"
                    style={{
                      backgroundColor:
                        mobileView === "preview"
                          ? "rgba(60, 101, 91, 0.15)"
                          : "transparent",
                      color: mobileView === "preview" ? "#3c655b" : "#6c757d",
                      borderRadius: "0 0.5rem 0.5rem 0",
                      fontWeight: mobileView === "preview" ? 600 : 400,
                    }}
                    onClick={() => setMobileView("preview")}
                  >
                    Preview
                  </Button>
                </ButtonGroup>
                {mobileView === "editor" ? (
                  editorContent
                ) : (
                  <div className="bg-white rounded-3 p-3">
                    <FormPreview elements={elements} />
                  </div>
                )}
              </>
            )}
          </Card>
        ) : (
          <div className="d-flex gap-4 align-items-start">
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <Card className="bg-lace-100 rounded-4 border-0 p-4">
                <span className="fw-semi-bold d-block mb-3">Form Builder</span>
                {tabNav}
                {activeTab === "project" ? (
                  <ProjectFieldsContent />
                ) : (
                  editorContent
                )}
              </Card>
            </div>
            <div style={{ width: "45%", flexShrink: 0 }}>
              <div style={{ position: "sticky", top: "1rem" }}>
                {previewPane}
              </div>
            </div>
          </div>
        )}
      </Stack>
    </>
  );
}

function FormPreview({ elements }: { elements: FormElement[] }) {
  if (elements.length === 0) {
    return <p className="text-info fs-sm">No items to preview.</p>;
  }

  return (
    <Form>
      {elements.map((el) => {
        switch (el.type) {
          case "section":
            return (
              <h5 key={el.id} className="fw-semi-bold mt-3 mb-2">
                {el.label || "(Section)"}
              </h5>
            );
          case "title":
            return (
              <h6 key={el.id} className="fw-semi-bold mt-2 mb-1">
                {el.label || "(Title)"}
              </h6>
            );
          case "description":
            return (
              <p key={el.id} className="text-info fs-sm mb-2">
                {el.content || el.label || "(Description)"}
              </p>
            );
          case "text":
          case "url":
          case "email":
          case "telegram":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
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
          case "textarea":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  disabled
                  className="rounded-3"
                  placeholder={el.placeholder ?? undefined}
                />
              </Form.Group>
            );
          case "number":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
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
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
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
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
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
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="fs-sm fw-semi-bold">
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="horizontal" gap={3}>
                  <Form.Check type="radio" label="Yes" disabled />
                  <Form.Check type="radio" label="No" disabled />
                </Stack>
              </Form.Group>
            );
        }
      })}
    </Form>
  );
}
