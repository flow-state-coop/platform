"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import CharacterCounter from "./CharacterCounter";
import { CHARACTER_LIMITS } from "../constants";
import {
  type BuildMilestone,
  type GrowthMilestone,
} from "@/app/flow-councils/types/round";

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

  const [touched, setTouched] = useState({ description: false });

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

  const milestoneLabel =
    type === "growth" ? "Growth Milestone" : "Build Milestone";

  return (
    <div className="border border-2 border-dark rounded-4 p-4 mb-4">
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-start mb-3"
      >
        <span className="fs-lg fw-bold">
          {milestoneLabel} {index + 1}
          {required && "*"}
        </span>
        {onRemove && (
          <Button
            variant="link"
            className="d-flex align-items-center justify-content-center p-0"
            onClick={onRemove}
          >
            <Image src="/close.svg" alt="Remove" width={28} height={28} />
          </Button>
        )}
      </Stack>
      {type === "growth" && (
        <p className="text-muted small mb-3">
          Growth isn&apos;t a dirty word. We want you to share your thinking at
          this stage, rather than shy away from commitments. GoodDollar has
          incentives (cashbacks, engagement rewards) available to help you
          experiment.
        </p>
      )}
      {type === "build" && (
        <p className="text-muted small mb-3">
          We value clarity. Smaller, well-defined milestones & deliverables are
          better than broad promises that are hard to verify.
        </p>
      )}

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold">Title{required && "*"}</Form.Label>
        <Form.Control
          type="text"
          value={milestone.title}
          placeholder="eg First users onboarded, New community activated, Pilot launched, etc"
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && required && !milestone.title.trim() ? "border-danger" : "border-dark"}`}
          isInvalid={validated && required && !milestone.title.trim()}
          onChange={(e) => onChange({ ...milestone, title: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold">
          Description{required && "*"}
        </Form.Label>
        {type === "growth" && <p className="text-muted small mb-2"></p>}
        <Form.Control
          as="textarea"
          rows={3}
          value={milestone.description}
          placeholder="Describe the outcomes you aim to achieve this round.
                       Include KPIs (numbers tied to your milestone) that will
                       serve as targets, not obligations. Examples include
                       transaction #s, repeat usage %, amount of liquidity added."
          className={`bg-white border border-2 rounded-2 py-3 px-3 ${(validated || touched.description) && required && (!milestone.description.trim() || milestone.description.length < CHARACTER_LIMITS.milestoneDescription.min || milestone.description.length > CHARACTER_LIMITS.milestoneDescription.max) ? "border-danger" : "border-dark"}`}
          style={{ resize: "vertical", backgroundImage: "none" }}
          isInvalid={
            (validated || touched.description) &&
            required &&
            (!milestone.description.trim() ||
              milestone.description.length <
                CHARACTER_LIMITS.milestoneDescription.min ||
              milestone.description.length >
                CHARACTER_LIMITS.milestoneDescription.max)
          }
          onChange={(e) =>
            onChange({ ...milestone, description: e.target.value })
          }
          onBlur={() => setTouched((prev) => ({ ...prev, description: true }))}
        />
        <CharacterCounter
          value={milestone.description}
          min={CHARACTER_LIMITS.milestoneDescription.min}
          max={CHARACTER_LIMITS.milestoneDescription.max}
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
                className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && required && itemIndex === 0 && !hasValidItem ? "border-danger" : "border-dark"}`}
                isInvalid={
                  validated && required && itemIndex === 0 && !hasValidItem
                }
                onChange={(e) => handleItemChange(itemIndex, e.target.value)}
              />
              {items.length > 1 && (
                <Button
                  variant="link"
                  className="d-flex align-items-center justify-content-center p-0"
                  onClick={() => handleRemoveItem(itemIndex)}
                >
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
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
