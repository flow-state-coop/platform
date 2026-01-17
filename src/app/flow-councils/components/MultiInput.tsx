"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";

type MultiInputProps = {
  label: string;
  subtitle?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  validate?: (value: string) => boolean;
  prefix?: string;
  required?: boolean;
  validated?: boolean;
  lockedIndices?: number[];
  invalidFeedback?: string;
};

export default function MultiInput(props: MultiInputProps) {
  const {
    label,
    subtitle,
    values,
    onChange,
    placeholder = "",
    addLabel = "Add Another",
    validate,
    prefix,
    required = false,
    validated = false,
    lockedIndices = [],
    invalidFeedback,
  } = props;

  const isLocked = (index: number) => lockedIndices.includes(index);

  const handleChange = (index: number, value: string) => {
    const newValues = [...values];
    newValues[index] = value;
    onChange(newValues);
  };

  const handleAdd = () => {
    onChange([...values, ""]);
  };

  const handleRemove = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    onChange(newValues.length > 0 ? newValues : [""]);
  };

  const isInvalid = (value: string, index: number) => {
    if (!validated) return false;
    if (required && index === 0 && !value) return true;
    if (value && validate && !validate(value)) return true;
    return false;
  };

  return (
    <Form.Group className="mb-4">
      <Form.Label className="fs-lg fw-bold mb-1">
        {label}
        {required && "*"}
      </Form.Label>
      {subtitle && <p className="text-muted small mb-2">{subtitle}</p>}
      <Stack direction="vertical" gap={2}>
        {values.map((value, index) => (
          <Stack key={index} direction="vertical" gap={1}>
            <Stack direction="horizontal" gap={2}>
              {prefix && (
                <span className="bg-white px-3 py-2 rounded fs-lg fw-semi-bold">
                  {prefix}
                </span>
              )}
              <Form.Control
                type="text"
                value={value}
                placeholder={placeholder}
                className={`border border-2 rounded-4 py-3 px-3 ${isLocked(index) ? "bg-secondary-subtle text-muted border-secondary" : `bg-white ${isInvalid(value, index) ? "border-danger" : "border-dark"}`}`}
                isInvalid={isInvalid(value, index)}
                disabled={isLocked(index)}
                onChange={(e) => handleChange(index, e.target.value)}
              />
              {values.length > 1 && !isLocked(index) && (
                <Button
                  variant="danger"
                  className="d-flex align-items-center justify-content-center p-0 rounded-2"
                  style={{ width: 40, height: 40, minWidth: 40 }}
                  onClick={() => handleRemove(index)}
                >
                  <span className="text-white fs-4 fw-bold">&times;</span>
                </Button>
              )}
            </Stack>
            {isInvalid(value, index) && invalidFeedback && (
              <span className="text-danger small">{invalidFeedback}</span>
            )}
          </Stack>
        ))}
        <Button
          variant="link"
          className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
          onClick={handleAdd}
        >
          {addLabel}
        </Button>
      </Stack>
    </Form.Group>
  );
}
