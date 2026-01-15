"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";

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
  };

  const isUrlInvalid = (url: string) => {
    if (!validated) return false;
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
                className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                isInvalid={isUrlInvalid(link.url)}
                onChange={(e) => handleChange(index, "url", e.target.value)}
              />
              <Button
                variant="danger"
                className="d-flex align-items-center justify-content-center p-0 rounded-2"
                style={{ width: 36, height: 36, minWidth: 36 }}
                onClick={() => handleRemove(index)}
              >
                <span
                  className="text-white fw-bold"
                  style={{ fontSize: 18, lineHeight: 1 }}
                >
                  &times;
                </span>
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
