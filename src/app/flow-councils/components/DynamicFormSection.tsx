"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import type { FormElement } from "@/app/flow-councils/types/formSchema";

type Props = {
  elements: FormElement[];
  values: Record<string, unknown>;
  onChange?: (id: string, value: unknown) => void;
  validated?: boolean;
  readOnly?: boolean;
  profileData?: { email?: string; telegram?: string };
};

export default function DynamicFormSection({
  elements,
  values,
  onChange,
  validated = false,
  readOnly = false,
  profileData,
}: Props) {
  const getValue = (id: string) => values[id] ?? "";
  const handleChange = (id: string, value: unknown) => {
    if (onChange) onChange(id, value);
  };

  return (
    <>
      {elements.map((el) => {
        switch (el.type) {
          case "section":
            return (
              <h4 key={el.id} className="fw-bold mt-4 mb-3">
                {el.label}
              </h4>
            );
          case "title":
            return (
              <h5 key={el.id} className="fw-bold mt-3 mb-2">
                {el.label}
              </h5>
            );
          case "description":
            return (
              <p key={el.id} className="text-muted mb-3">
                {el.content || el.label}
              </p>
            );
          case "text":
          case "url":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type={el.type}
                  value={String(getValue(el.id))}
                  disabled={readOnly}
                  placeholder={el.placeholder}
                  className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                  isInvalid={
                    validated &&
                    !!el.required &&
                    !String(getValue(el.id)).trim()
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                />
              </Form.Group>
            );
          case "email": {
            const val = String(getValue(el.id));
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="email"
                  value={val}
                  disabled={readOnly}
                  placeholder={profileData?.email ?? "email@example.com"}
                  className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                  isInvalid={validated && !!el.required && !val.trim()}
                  onChange={(e) => handleChange(el.id, e.target.value)}
                  onFocus={() => {
                    if (!val && profileData?.email) {
                      handleChange(el.id, profileData.email);
                    }
                  }}
                />
                {profileData?.email && !readOnly && (
                  <Form.Text className="text-muted">
                    From your profile. You can edit or clear it.
                  </Form.Text>
                )}
              </Form.Group>
            );
          }
          case "telegram": {
            const val = String(getValue(el.id));
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={val}
                  disabled={readOnly}
                  placeholder={profileData?.telegram ?? "@handle"}
                  className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                  isInvalid={validated && !!el.required && !val.trim()}
                  onChange={(e) => handleChange(el.id, e.target.value)}
                  onFocus={() => {
                    if (!val && profileData?.telegram) {
                      handleChange(el.id, profileData.telegram);
                    }
                  }}
                />
                {profileData?.telegram && !readOnly && (
                  <Form.Text className="text-muted">
                    From your profile. You can edit or clear it.
                  </Form.Text>
                )}
              </Form.Group>
            );
          }
          case "textarea":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={String(getValue(el.id))}
                  disabled={readOnly}
                  placeholder={el.placeholder}
                  maxLength={el.charLimit}
                  className="bg-white border border-2 border-dark rounded-2 py-3 px-3"
                  style={{ resize: "vertical" }}
                  isInvalid={
                    validated &&
                    !!el.required &&
                    !String(getValue(el.id)).trim()
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                />
                {el.charLimit && (
                  <Form.Text className="text-muted">
                    {String(getValue(el.id)).length} / {el.charLimit}
                  </Form.Text>
                )}
              </Form.Group>
            );
          case "number":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="number"
                  value={String(getValue(el.id))}
                  disabled={readOnly}
                  min={el.min}
                  max={el.max}
                  className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                  style={{ maxWidth: 200 }}
                  isInvalid={
                    validated &&
                    !!el.required &&
                    !String(getValue(el.id)).trim()
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                />
              </Form.Group>
            );
          case "select":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="vertical" gap={2}>
                  {el.options.map((opt, i) => (
                    <Form.Check
                      key={i}
                      type="radio"
                      id={`${el.id}-${i}`}
                      name={el.id}
                      label={opt}
                      disabled={readOnly}
                      checked={getValue(el.id) === opt}
                      isInvalid={validated && !!el.required && !getValue(el.id)}
                      onChange={() => handleChange(el.id, opt)}
                    />
                  ))}
                </Stack>
              </Form.Group>
            );
          case "multiSelect": {
            const selected = (getValue(el.id) as string[]) || [];
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="vertical" gap={2}>
                  {el.options.map((opt, i) => (
                    <Form.Check
                      key={i}
                      type="checkbox"
                      id={`${el.id}-${i}`}
                      label={opt}
                      disabled={readOnly}
                      checked={selected.includes(opt)}
                      isInvalid={
                        validated && !!el.required && selected.length === 0
                      }
                      onChange={(e) => {
                        const newSelected = e.target.checked
                          ? [...selected, opt]
                          : selected.filter((s) => s !== opt);
                        handleChange(el.id, newSelected);
                      }}
                    />
                  ))}
                </Stack>
              </Form.Group>
            );
          }
          case "boolean":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="horizontal" gap={4}>
                  <Form.Check
                    type="radio"
                    id={`${el.id}-yes`}
                    name={el.id}
                    label="Yes"
                    disabled={readOnly}
                    checked={getValue(el.id) === true}
                    isInvalid={
                      validated &&
                      !!el.required &&
                      getValue(el.id) !== true &&
                      getValue(el.id) !== false
                    }
                    onChange={() => handleChange(el.id, true)}
                  />
                  <Form.Check
                    type="radio"
                    id={`${el.id}-no`}
                    name={el.id}
                    label="No"
                    disabled={readOnly}
                    checked={getValue(el.id) === false}
                    isInvalid={
                      validated &&
                      !!el.required &&
                      getValue(el.id) !== true &&
                      getValue(el.id) !== false
                    }
                    onChange={() => handleChange(el.id, false)}
                  />
                </Stack>
              </Form.Group>
            );
        }
      })}
    </>
  );
}
