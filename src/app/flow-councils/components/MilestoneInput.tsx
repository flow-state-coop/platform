"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";

export type BuildMilestone = {
  title: string;
  description: string;
  deliverables: string[];
};

export type GrowthMilestone = {
  title: string;
  description: string;
  activations: string[];
};

type MilestoneInputProps = {
  milestone: BuildMilestone | GrowthMilestone;
  onChange: (milestone: BuildMilestone | GrowthMilestone) => void;
  onRemove?: () => void;
  validated: boolean;
  required?: boolean;
  type: "build" | "growth";
  index: number;
};

export default function MilestoneInput(props: MilestoneInputProps) {
  const {
    milestone,
    onChange,
    onRemove,
    validated,
    required = false,
    type,
    index,
  } = props;

  const items =
    type === "build"
      ? (milestone as BuildMilestone).deliverables
      : (milestone as GrowthMilestone).activations;

  const itemLabel = type === "build" ? "Deliverable" : "Activation";

  const handleItemChange = (itemIndex: number, value: string) => {
    const newItems = [...items];
    newItems[itemIndex] = value;
    if (type === "build") {
      onChange({ ...milestone, deliverables: newItems } as BuildMilestone);
    } else {
      onChange({ ...milestone, activations: newItems } as GrowthMilestone);
    }
  };

  const handleAddItem = () => {
    if (type === "build") {
      onChange({
        ...milestone,
        deliverables: [...items, ""],
      } as BuildMilestone);
    } else {
      onChange({
        ...milestone,
        activations: [...items, ""],
      } as GrowthMilestone);
    }
  };

  const handleRemoveItem = (itemIndex: number) => {
    const newItems = items.filter((_, i) => i !== itemIndex);
    if (type === "build") {
      onChange({
        ...milestone,
        deliverables: newItems.length > 0 ? newItems : [""],
      } as BuildMilestone);
    } else {
      onChange({
        ...milestone,
        activations: newItems.length > 0 ? newItems : [""],
      } as GrowthMilestone);
    }
  };

  const hasValidItem = items.some((item) => item.trim() !== "");

  return (
    <div className="border border-2 border-dark rounded-4 p-4 mb-4">
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-start mb-3"
      >
        <span className="fs-lg fw-bold">
          Milestone {index + 1}
          {required && "*"}
        </span>
        {onRemove && (
          <Button
            variant="danger"
            className="d-flex align-items-center justify-content-center p-0 rounded-2"
            style={{ width: 28, height: 28, minWidth: 28 }}
            onClick={onRemove}
          >
            <span className="text-white fs-6 fw-bold">&times;</span>
          </Button>
        )}
      </Stack>

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold">Title{required && "*"}</Form.Label>
        <Form.Control
          type="text"
          value={milestone.title}
          placeholder="Title"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          isInvalid={validated && required && !milestone.title.trim()}
          onChange={(e) => onChange({ ...milestone, title: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold">
          Description{required && "*"}
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={milestone.description}
          placeholder="Description"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          style={{ resize: "none" }}
          isInvalid={validated && required && !milestone.description.trim()}
          onChange={(e) =>
            onChange({ ...milestone, description: e.target.value })
          }
        />
      </Form.Group>

      <Form.Group>
        <Stack direction="vertical" gap={2}>
          {items.map((item, itemIndex) => (
            <Stack key={itemIndex} direction="horizontal" gap={2}>
              <Form.Control
                type="text"
                value={item}
                placeholder={`${itemLabel} ${itemIndex + 1}: ${type === "build" ? "concrete output required to reach the milestone" : "Plan to reach your milestone (eg Partner with X)"}`}
                className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                isInvalid={
                  validated && required && itemIndex === 0 && !hasValidItem
                }
                onChange={(e) => handleItemChange(itemIndex, e.target.value)}
              />
              {items.length > 1 && (
                <Button
                  variant="danger"
                  className="d-flex align-items-center justify-content-center p-0 rounded-2"
                  style={{ width: 40, height: 40, minWidth: 40 }}
                  onClick={() => handleRemoveItem(itemIndex)}
                >
                  <span className="text-white fs-4 fw-bold">&times;</span>
                </Button>
              )}
            </Stack>
          ))}
          <Button
            variant="link"
            className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
            onClick={handleAddItem}
          >
            Add {itemLabel}
          </Button>
        </Stack>
      </Form.Group>
    </div>
  );
}
