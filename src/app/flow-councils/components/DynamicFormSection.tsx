"use client";

import { useMemo } from "react";
import { isAddress } from "viem";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Markdown from "@/components/Markdown";
import MarkdownEditor from "@/components/MarkdownEditor";
import CharacterCounter from "@/app/flow-councils/components/CharacterCounter";
import { normalizeEvidenceUrl } from "@/app/api/flow-council/validation";
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

  const inputClass = readOnly
    ? "bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
    : "bg-white border border-2 border-dark rounded-4 py-3 px-3";

  const numberMap = useMemo(() => {
    const map = new Map<string, string>();
    const hasSections = elements.some((el) => el.type === "section");
    let sectionIdx = 0;
    let questionIdx = 0;
    for (const el of elements) {
      if (el.type === "section") {
        sectionIdx++;
        questionIdx = 0;
      } else if (el.type !== "description" && el.type !== "divider") {
        questionIdx++;
        map.set(
          el.id,
          hasSections ? `${sectionIdx}.${questionIdx}` : `${questionIdx}`,
        );
      }
    }
    return map;
  }, [elements]);

  const num = (id: string) => {
    const n = numberMap.get(id);
    return n ? `${n}. ` : "";
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
          case "description":
            return (
              <p key={el.id} className="text-muted mb-3">
                {el.content || el.label}
              </p>
            );
          case "divider":
            return <hr key={el.id} className="my-3" />;
          case "text":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={String(getValue(el.id))}
                  disabled={readOnly}
                  placeholder={el.placeholder}
                  className={inputClass}
                  isInvalid={
                    validated &&
                    !!el.required &&
                    !String(getValue(el.id)).trim()
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                />
              </Form.Group>
            );
          case "url": {
            const urlVal = String(getValue(el.id));
            const baseUrlInvalid =
              el.baseUrl && urlVal.trim() && !urlVal.startsWith(el.baseUrl);
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                {el.baseUrl && (
                  <Form.Text className="text-muted d-block mb-1">
                    Must start with {el.baseUrl}
                  </Form.Text>
                )}
                <Form.Control
                  type="url"
                  value={urlVal}
                  disabled={readOnly}
                  placeholder={el.placeholder ?? el.baseUrl}
                  className={inputClass}
                  isInvalid={
                    (validated && !!el.required && !urlVal.trim()) ||
                    !!baseUrlInvalid
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                  onBlur={() => {
                    if (urlVal.trim()) {
                      handleChange(el.id, normalizeEvidenceUrl(urlVal));
                    }
                  }}
                />
                {baseUrlInvalid && (
                  <Form.Text className="text-danger">
                    URL must start with {el.baseUrl}
                  </Form.Text>
                )}
              </Form.Group>
            );
          }
          case "email": {
            const val = String(getValue(el.id));
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="email"
                  value={val}
                  disabled={readOnly}
                  placeholder={profileData?.email ?? "email@example.com"}
                  className={inputClass}
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
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={val}
                  disabled={readOnly}
                  placeholder={profileData?.telegram ?? "@handle"}
                  className={inputClass}
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
          case "textarea": {
            const val = String(getValue(el.id));
            const useMarkdown = el.markdown !== false;
            const hasLimits = el.charLimit || el.minCharLimit;
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                {readOnly ? (
                  useMarkdown && val.trim() ? (
                    <div className="bg-light rounded-4 py-3 px-3">
                      <Markdown>{val}</Markdown>
                    </div>
                  ) : (
                    <Form.Control
                      as="textarea"
                      rows={4}
                      value={val}
                      disabled
                      className={`${inputClass} rounded-2`}
                      style={{ resize: "none" }}
                    />
                  )
                ) : useMarkdown ? (
                  <MarkdownEditor
                    value={val}
                    onChange={(e) => handleChange(el.id, e.target.value)}
                    placeholder={el.placeholder}
                    rows={4}
                    resizable
                    isInvalid={validated && !!el.required && !val.trim()}
                    characterCounter={
                      hasLimits
                        ? {
                            value: val,
                            min: el.minCharLimit,
                            max: el.charLimit,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <>
                    <Form.Control
                      as="textarea"
                      rows={4}
                      value={val}
                      placeholder={el.placeholder}
                      maxLength={el.charLimit}
                      className={`${inputClass} rounded-2`}
                      style={{ resize: "vertical" }}
                      isInvalid={validated && !!el.required && !val.trim()}
                      onChange={(e) => handleChange(el.id, e.target.value)}
                    />
                    {hasLimits && (
                      <CharacterCounter
                        value={val}
                        min={el.minCharLimit}
                        max={el.charLimit}
                      />
                    )}
                  </>
                )}
              </Form.Group>
            );
          }
          case "number":
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="number"
                  value={String(getValue(el.id))}
                  disabled={readOnly}
                  min={el.min}
                  max={el.max}
                  className={inputClass}
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
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="vertical" gap={2}>
                  {(el.options ?? []).map((opt, i) => (
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
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Stack direction="vertical" gap={2}>
                  {(el.options ?? []).map((opt, i) => (
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
                  {num(el.id)}
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
          case "ethAddress": {
            const val = String(getValue(el.id));
            const ethInvalid = validated && val.trim() && !isAddress(val);
            return (
              <Form.Group key={el.id} className="mb-4">
                <Form.Label className="fs-lg fw-bold">
                  {num(el.id)}
                  {el.label}
                  {el.required && "*"}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={val}
                  disabled={readOnly}
                  placeholder={el.placeholder ?? "0x..."}
                  className={inputClass}
                  isInvalid={
                    (validated && !!el.required && !val.trim()) || !!ethInvalid
                  }
                  onChange={(e) => handleChange(el.id, e.target.value)}
                />
                {ethInvalid && (
                  <Form.Text className="text-danger">
                    Please enter a valid ETH address
                  </Form.Text>
                )}
              </Form.Group>
            );
          }
        }
      })}
    </>
  );
}
