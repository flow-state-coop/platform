"use client";

import Dropdown from "react-bootstrap/Dropdown";

type MessageActionsProps = {
  canEdit: boolean;
  canDelete: boolean;
  canHide?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHide?: () => void;
};

export default function MessageActions(props: MessageActionsProps) {
  const { canEdit, canDelete, canHide, onEdit, onDelete, onHide } = props;

  if (!canEdit && !canDelete && !canHide) {
    return null;
  }

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        as="button"
        bsPrefix="btn-unstyled"
        className="p-1 border-0 bg-transparent text-dark opacity-50"
        style={{ lineHeight: 1 }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="p-2 shadow-sm"
        popperConfig={{ strategy: "fixed" }}
        renderOnMount
      >
        {canEdit && (
          <Dropdown.Item className="fw-semi-bold" onClick={onEdit}>
            Edit
          </Dropdown.Item>
        )}
        {canHide && (
          <Dropdown.Item className="fw-semi-bold" onClick={onHide}>
            Hide from feed
          </Dropdown.Item>
        )}
        {canDelete && (
          <Dropdown.Item
            className="fw-semi-bold text-danger"
            onClick={onDelete}
          >
            Delete
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
