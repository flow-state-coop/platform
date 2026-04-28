"use client";

import { useEffect } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import MarkdownEditor from "@/components/MarkdownEditor";
import Markdown from "@/components/Markdown";
import type { MilestoneQuestion } from "@/app/flow-councils/types/formSchema";

export type DynamicMilestoneValue = {
  title: string;
  description: string;
  items: string[];
};

type Props = {
  element: MilestoneQuestion;
  values: DynamicMilestoneValue[];
  onChange: (values: DynamicMilestoneValue[]) => void;
  validated: boolean;
  readOnly?: boolean;
  lockBlockCount?: boolean;
  numberPrefix?: string;
};

function emptyMilestone(): DynamicMilestoneValue {
  return { title: "", description: "", items: [""] };
}

export default function DynamicMilestoneInput(props: Props) {
  const {
    element,
    values,
    onChange,
    validated,
    readOnly = false,
    lockBlockCount = false,
    numberPrefix = "",
  } = props;

  const minCount = Math.max(1, Math.min(5, element.minCount ?? 1));
  const milestoneLabel = element.milestoneLabel || "Milestone";
  const itemLabel = element.itemLabel || "Deliverable";

  useEffect(() => {
    if (readOnly) return;
    if (values.length < minCount) {
      const padded = [...values];
      while (padded.length < minCount) padded.push(emptyMilestone());
      onChange(padded);
    }
    // values.length (not values) — the array identity changes on every parent
    // render via spread updates, which would cause an infinite re-render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.length, minCount, readOnly, onChange]);

  const updateMilestone = (index: number, next: DynamicMilestoneValue) => {
    const copy = [...values];
    copy[index] = next;
    onChange(copy);
  };

  const addMilestone = () => {
    onChange([...values, emptyMilestone()]);
  };

  const removeMilestone = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const updateItem = (mIndex: number, iIndex: number, value: string) => {
    const milestone = values[mIndex];
    const newItems = [...milestone.items];
    newItems[iIndex] = value;
    updateMilestone(mIndex, { ...milestone, items: newItems });
  };

  const addItem = (mIndex: number) => {
    const milestone = values[mIndex];
    updateMilestone(mIndex, {
      ...milestone,
      items: [...milestone.items, ""],
    });
  };

  const removeItem = (mIndex: number, iIndex: number) => {
    const milestone = values[mIndex];
    const newItems = milestone.items.filter((_, i) => i !== iIndex);
    updateMilestone(mIndex, {
      ...milestone,
      items: newItems.length > 0 ? newItems : [""],
    });
  };

  const blocks = values.length >= minCount ? values : [
    ...values,
    ...Array.from({ length: minCount - values.length }, emptyMilestone),
  ];

  const canAdd = !readOnly && !lockBlockCount;
  const canRemoveBlock = (i: number) =>
    !readOnly && !lockBlockCount && i >= minCount;

  return (
    <Form.Group className="mb-4">
      {element.label && (
        <Form.Label className="fs-lg fw-bold">
          {numberPrefix}
          {element.label}
          {element.required && "*"}
        </Form.Label>
      )}
      {blocks.map((milestone, i) => {
        const descTooShort =
          typeof element.descriptionMinChars === "number" &&
          milestone.description.length > 0 &&
          milestone.description.length < element.descriptionMinChars;
        const descTooLong =
          typeof element.descriptionMaxChars === "number" &&
          milestone.description.length > element.descriptionMaxChars;
        const descInvalid =
          validated &&
          (!milestone.description.trim() || descTooShort || descTooLong);
        const titleInvalid = validated && !milestone.title.trim();
        const hasValidItem = milestone.items.some((it) => it.trim() !== "");
        const itemsInvalid = validated && !hasValidItem;

        return (
          <div
            key={i}
            className="border border-2 border-dark rounded-4 p-4 mb-3"
          >
            <Stack
              direction="horizontal"
              className="justify-content-between align-items-start mb-3"
            >
              <span className="fs-lg fw-bold">
                {milestoneLabel} {i + 1}
                {element.required && "*"}
              </span>
              {canRemoveBlock(i) && (
                <Button
                  variant="link"
                  className="d-flex align-items-center justify-content-center p-0"
                  onClick={() => removeMilestone(i)}
                  aria-label={`Remove ${milestoneLabel} ${i + 1}`}
                >
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
                </Button>
              )}
            </Stack>

            <Form.Group className="mb-3">
              <Form.Label className="fw-bold">Title*</Form.Label>
              <Form.Control
                type="text"
                value={milestone.title}
                disabled={readOnly}
                placeholder="Title"
                className={`bg-white border border-2 rounded-4 py-3 px-3 ${titleInvalid ? "border-danger" : "border-dark"}`}
                isInvalid={titleInvalid}
                onChange={(e) =>
                  updateMilestone(i, { ...milestone, title: e.target.value })
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-bold">Description*</Form.Label>
              {readOnly ? (
                milestone.description.trim() ? (
                  <div className="bg-light rounded-4 py-3 px-3">
                    <Markdown>{milestone.description}</Markdown>
                  </div>
                ) : (
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value=""
                    disabled
                    className="bg-light border-0 rounded-4 py-3 px-3"
                  />
                )
              ) : (
                <MarkdownEditor
                  value={milestone.description}
                  onChange={(e) =>
                    updateMilestone(i, {
                      ...milestone,
                      description: e.target.value,
                    })
                  }
                  placeholder={element.descriptionPlaceholder}
                  rows={4}
                  resizable
                  isInvalid={descInvalid}
                  characterCounter={
                    typeof element.descriptionMinChars === "number" ||
                    typeof element.descriptionMaxChars === "number"
                      ? {
                          value: milestone.description,
                          min: element.descriptionMinChars,
                          max: element.descriptionMaxChars,
                        }
                      : undefined
                  }
                />
              )}
            </Form.Group>

            <Form.Group>
              <Form.Label className="fw-bold">{itemLabel}s*</Form.Label>
              <Stack direction="vertical" gap={2}>
                {milestone.items.map((item, iIndex) => (
                  <Stack key={iIndex} direction="horizontal" gap={2}>
                    <Form.Control
                      type="text"
                      value={item}
                      disabled={readOnly}
                      placeholder={`${itemLabel} ${iIndex + 1}`}
                      className={`bg-white border border-2 rounded-4 py-3 px-3 ${itemsInvalid && iIndex === 0 ? "border-danger" : "border-dark"}`}
                      isInvalid={itemsInvalid && iIndex === 0}
                      onChange={(e) => updateItem(i, iIndex, e.target.value)}
                    />
                    {!readOnly && milestone.items.length > 1 && (
                      <Button
                        variant="link"
                        className="d-flex align-items-center justify-content-center p-0"
                        onClick={() => removeItem(i, iIndex)}
                        aria-label={`Remove ${itemLabel} ${iIndex + 1}`}
                      >
                        <Image
                          src="/close.svg"
                          alt="Remove"
                          width={28}
                          height={28}
                        />
                      </Button>
                    )}
                  </Stack>
                ))}
                {!readOnly && (
                  <Button
                    variant="link"
                    className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
                    onClick={() => addItem(i)}
                  >
                    Add {itemLabel}
                  </Button>
                )}
              </Stack>
            </Form.Group>
          </div>
        );
      })}

      {canAdd && (
        <Button
          variant="link"
          className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
          onClick={addMilestone}
        >
          Add {milestoneLabel}
        </Button>
      )}
    </Form.Group>
  );
}
