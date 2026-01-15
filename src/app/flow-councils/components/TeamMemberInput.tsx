"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";

export type TeamMember = {
  name: string;
  roleDescription: string;
  telegram: string;
  githubOrLinkedin: string;
};

type TeamMemberInputProps = {
  member: TeamMember;
  onChange: (member: TeamMember) => void;
  onRemove?: () => void;
  validated: boolean;
  isPrimary?: boolean;
  label: string;
};

export default function TeamMemberInput(props: TeamMemberInputProps) {
  const {
    member,
    onChange,
    onRemove,
    validated,
    isPrimary = false,
    label,
  } = props;

  return (
    <div className="mb-4">
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-center mb-3"
      >
        <span className="fs-lg fw-bold">
          {label}
          {isPrimary && "*"}
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
        <Form.Control
          type="text"
          value={member.name}
          placeholder="Name"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          isInvalid={validated && isPrimary && !member.name.trim()}
          onChange={(e) => onChange({ ...member, name: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Control
          as="textarea"
          rows={3}
          value={member.roleDescription}
          placeholder="Role & Description"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          style={{ resize: "none" }}
          isInvalid={validated && isPrimary && !member.roleDescription.trim()}
          onChange={(e) =>
            onChange({ ...member, roleDescription: e.target.value })
          }
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Control
          type="text"
          value={member.telegram}
          placeholder="Telegram - https://t.me/..."
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          onChange={(e) => onChange({ ...member, telegram: e.target.value })}
        />
      </Form.Group>

      <Form.Group>
        <Form.Control
          type="text"
          value={member.githubOrLinkedin}
          placeholder="Github/LinkedIn Profile"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          onChange={(e) =>
            onChange({ ...member, githubOrLinkedin: e.target.value })
          }
        />
      </Form.Group>
    </div>
  );
}
