"use client";

import { useState, useEffect, useCallback } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Nav from "react-bootstrap/Nav";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import Stack from "react-bootstrap/Stack";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useRequireAuth from "@/hooks/requireAuth";
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

type ActiveTab = "round" | "attestation";

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

const ELEMENT_TYPES: { value: FormElement["type"]; label: string }[] = [
  { value: "section", label: "Section Heading" },
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
];

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

  return (
    <Card className="mb-2">
      <Card.Header
        className="d-flex align-items-center justify-content-between py-2 px-3"
        style={{ cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="d-flex align-items-center gap-2">
          <Badge bg="info" className="text-capitalize">
            {element.type}
          </Badge>
          <span className="text-truncate" style={{ maxWidth: 300 }}>
            {element.label || "(untitled)"}
          </span>
        </div>
        <div className="d-flex gap-1">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
          >
            Up
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
          >
            Down
          </Button>
          <Button
            size="sm"
            variant="outline-danger"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            Remove
          </Button>
        </div>
      </Card.Header>
      {expanded && (
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold">Label</Form.Label>
            <Form.Control
              type="text"
              value={element.label}
              onChange={(e) => onUpdate({ ...element, label: e.target.value })}
              placeholder="Question or heading text"
            />
          </Form.Group>

          {element.type === "description" && (
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Content</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
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
              <Form.Label className="small fw-bold">Placeholder</Form.Label>
              <Form.Control
                type="text"
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
              <Form.Label className="small fw-bold">Character Limit</Form.Label>
              <Form.Control
                type="number"
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
                <Form.Label className="small fw-bold">Min</Form.Label>
                <Form.Control
                  type="number"
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
                <Form.Label className="small fw-bold">Max</Form.Label>
                <Form.Control
                  type="number"
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
              <Form.Label className="small fw-bold">Options</Form.Label>
              {element.options.map((opt, i) => (
                <Stack key={i} direction="horizontal" gap={2} className="mb-2">
                  <Form.Control
                    type="text"
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
                      size="sm"
                      variant="outline-danger"
                      onClick={() =>
                        onUpdate({
                          ...element,
                          options: element.options.filter((_, j) => j !== i),
                        })
                      }
                    >
                      X
                    </Button>
                  )}
                </Stack>
              ))}
              <Button
                size="sm"
                variant="link"
                className="p-0"
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
        </Card.Body>
      )}
    </Card>
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
  const [showPreview, setShowPreview] = useState(false);

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

  const elements = schema[activeTab];

  const updateElements = (newElements: FormElement[]) => {
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
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="py-4">
      <Stack
        direction="horizontal"
        gap={3}
        className="mb-4 justify-content-between"
      >
        <h3 className="fw-bold mb-0">Application Form</h3>
        <Stack direction="horizontal" gap={2}>
          <Dropdown>
            <Dropdown.Toggle variant="outline-secondary" size="sm">
              Start from Template
            </Dropdown.Toggle>
            <Dropdown.Menu>
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
          <Button
            onClick={() => requireAuth(handleSave)}
            disabled={isSaving}
            size="sm"
          >
            {isSaving ? <Spinner size="sm" /> : "Save"}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {hasApplications && (
        <Alert variant="warning">
          Applications already exist. Adding required questions may require
          applicants to update.
        </Alert>
      )}

      <Nav
        variant="tabs"
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k as ActiveTab)}
        className="mb-4"
      >
        <Nav.Item>
          <Nav.Link eventKey="round">Round Questions</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="attestation">Attestation Questions</Nav.Link>
        </Nav.Item>
      </Nav>

      <Row>
        <Col md={isMobile ? 12 : 6}>
          {elements.length === 0 && (
            <p className="text-muted">
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
              <Dropdown.Toggle variant="outline-primary" size="sm">
                Add Question
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {QUESTION_TYPES.map((qt) => (
                  <Dropdown.Item
                    key={qt.value}
                    onClick={() => handleAdd(qt.value)}
                  >
                    {qt.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            {ELEMENT_TYPES.map((et) => (
              <Button
                key={et.value}
                variant="outline-secondary"
                size="sm"
                onClick={() => handleAdd(et.value)}
              >
                {et.label}
              </Button>
            ))}
          </Stack>
        </Col>

        {!isMobile && (
          <Col md={6}>
            <div className="border rounded p-3 bg-light">
              <h6 className="fw-bold mb-3">Preview</h6>
              <FormPreview elements={elements} />
            </div>
          </Col>
        )}
      </Row>

      {isMobile && (
        <>
          <Button
            variant="outline-secondary"
            size="sm"
            className="mt-3"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          {showPreview && (
            <div className="border rounded p-3 bg-light mt-3">
              <h6 className="fw-bold mb-3">Preview</h6>
              <FormPreview elements={elements} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FormPreview({ elements }: { elements: FormElement[] }) {
  if (elements.length === 0) {
    return <p className="text-muted small">No items to preview.</p>;
  }

  return (
    <Form>
      {elements.map((el) => {
        switch (el.type) {
          case "section":
            return (
              <h5 key={el.id} className="fw-bold mt-3 mb-2">
                {el.label || "(Section)"}
              </h5>
            );
          case "title":
            return (
              <h6 key={el.id} className="fw-bold mt-2 mb-1">
                {el.label || "(Title)"}
              </h6>
            );
          case "description":
            return (
              <p key={el.id} className="text-muted small mb-2">
                {el.content || el.label || "(Description)"}
              </p>
            );
          case "text":
          case "url":
          case "email":
          case "telegram":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="small fw-bold">
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type={el.type === "telegram" ? "text" : el.type}
                  disabled
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
                <Form.Label className="small fw-bold">
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  disabled
                  placeholder={el.placeholder ?? undefined}
                />
              </Form.Group>
            );
          case "number":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="small fw-bold">
                  {el.label || "(Untitled)"}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="number"
                  disabled
                  min={el.min}
                  max={el.max}
                />
              </Form.Group>
            );
          case "select":
            return (
              <Form.Group key={el.id} className="mb-3">
                <Form.Label className="small fw-bold">
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
                <Form.Label className="small fw-bold">
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
                <Form.Label className="small fw-bold">
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
