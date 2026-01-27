"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";

export type OtherLink = {
  description: string;
  url: string;
};

type OtherLinkRowProps = {
  links: OtherLink[];
  onChange: (links: OtherLink[]) => void;
  validated?: boolean;
};

export default function OtherLinkRow(props: OtherLinkRowProps) {
  const { links, onChange, validated = false } = props;

  const [touchedUrls, setTouchedUrls] = useState<Set<number>>(new Set());

  const handleChange = (
    index: number,
    field: keyof OtherLink,
    value: string,
  ) => {
    const newLinks = [...links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    onChange(newLinks);
  };

  const handleAdd = () => {
    onChange([...links, { description: "", url: "" }]);
  };

  const handleRemove = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    onChange(newLinks);
    setTouchedUrls((prev) => {
      const newSet = new Set<number>();
      prev.forEach((i) => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  };

  const isUrlInvalid = (url: string, index: number) => {
    if (!validated && !touchedUrls.has(index)) return false;
    return url !== "" && !url.startsWith("https://");
  };

  return (
    <Form.Group className="mb-4">
      <Form.Label className="fs-lg fw-bold">Other Links</Form.Label>
      <Stack direction="vertical" gap={3}>
        {links.map((link, index) => (
          <Stack key={index} direction="vertical" gap={2}>
            <Form.Control
              type="text"
              value={link.description}
              placeholder="Description"
              className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
              style={{ maxWidth: 300 }}
              onChange={(e) =>
                handleChange(index, "description", e.target.value)
              }
            />
            <Stack direction="horizontal" gap={2}>
              <Form.Control
                type="text"
                value={link.url}
                placeholder="https://..."
                className={`bg-white border border-2 rounded-4 py-3 px-3 ${isUrlInvalid(link.url, index) ? "border-danger" : "border-dark"}`}
                isInvalid={isUrlInvalid(link.url, index)}
                onChange={(e) => handleChange(index, "url", e.target.value)}
                onBlur={() =>
                  setTouchedUrls((prev) => new Set(prev).add(index))
                }
              />
              <Button
                variant="link"
                className="d-flex align-items-center justify-content-center p-0"
                onClick={() => handleRemove(index)}
              >
                <Image src="/close.svg" alt="Remove" width={28} height={28} />
              </Button>
            </Stack>
          </Stack>
        ))}
        <Button
          variant="link"
          className="p-0 text-start text-decoration-underline fw-semi-bold text-primary"
          onClick={handleAdd}
        >
          Add Another
        </Button>
      </Stack>
    </Form.Group>
  );
}
