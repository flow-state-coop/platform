"use client";

import { isAddress } from "viem";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Stack from "react-bootstrap/Stack";

type Props = {
  value: string;
  onChange: (value: string) => void;
  defaultFundingAddress: string;
  locked: boolean;
  validated: boolean;
};

export default function FundingAddressSection({
  value,
  onChange,
  defaultFundingAddress,
  locked,
  validated,
}: Props) {
  const isInvalid = validated && (!value.trim() || !isAddress(value));

  return (
    <Form.Group className="mb-4">
      <Stack direction="horizontal" gap={2} className="mb-1">
        <Form.Label className="fs-lg fw-bold mb-0">
          Wallet to receive funding
        </Form.Label>
        {defaultFundingAddress && !locked && (
          <Button
            variant="link"
            className="p-0 text-decoration-underline fw-semi-bold text-primary"
            onClick={() => onChange(defaultFundingAddress)}
          >
            (Use your project default)
          </Button>
        )}
      </Stack>
      <div
        title={
          locked
            ? "Changing the funding address requires a new application."
            : undefined
        }
        style={locked ? { cursor: "not-allowed" } : undefined}
      >
        <Form.Control
          type="text"
          value={value}
          placeholder="0x..."
          disabled={locked}
          style={locked ? { pointerEvents: "none" } : undefined}
          className={`${!locked ? "bg-white" : ""} border border-2 rounded-4 py-3 px-3 ${isInvalid ? "border-danger" : "border-dark"}`}
          isInvalid={isInvalid}
          onChange={(e) => onChange(e.target.value)}
        />
        <Form.Control.Feedback type="invalid">
          Please enter a valid ETH address
        </Form.Control.Feedback>
      </div>
    </Form.Group>
  );
}
