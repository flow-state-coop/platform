"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import { isAddress } from "viem";
import { networks } from "@/lib/networks";

export type SmartContract = {
  type: "projectAddress" | "goodCollectivePool";
  network: string;
  address: string;
};

type SmartContractRowProps = {
  contracts: SmartContract[];
  onChange: (contracts: SmartContract[]) => void;
  validated?: boolean;
};

const CONTRACT_TYPES = [
  { value: "projectAddress", label: "Project Address" },
  { value: "goodCollectivePool", label: "GoodCollective Pool" },
];

export default function SmartContractRow(props: SmartContractRowProps) {
  const { contracts, onChange, validated = false } = props;

  const handleChange = (
    index: number,
    field: keyof SmartContract,
    value: string,
  ) => {
    const newContracts = [...contracts];
    newContracts[index] = { ...newContracts[index], [field]: value };
    onChange(newContracts);
  };

  const handleAdd = () => {
    onChange([
      ...contracts,
      { type: "projectAddress", network: networks[0]?.name ?? "", address: "" },
    ]);
  };

  const handleRemove = (index: number) => {
    const newContracts = contracts.filter((_, i) => i !== index);
    onChange(newContracts);
  };

  const isAddressInvalid = (address: string) => {
    if (!validated) return false;
    return address !== "" && !isAddress(address);
  };

  const getTypeLabel = (type: string) => {
    return CONTRACT_TYPES.find((t) => t.value === type)?.label ?? type;
  };

  return (
    <Form.Group className="mb-4">
      <Form.Label className="fs-lg fw-bold mb-1">Smart Contracts</Form.Label>
      <p className="text-muted small mb-2">
        Add the contracts associated to your project for metrics evaluation.
      </p>
      <Stack direction="vertical" gap={3}>
        {contracts.map((contract, index) => (
          <Stack key={index} direction="vertical" gap={2}>
            <Stack direction="horizontal" gap={2}>
              <Dropdown>
                <Dropdown.Toggle
                  className="d-flex justify-content-between align-items-center bg-white border border-2 border-dark rounded-4 py-3 px-3 fw-semi-bold text-dark"
                  style={{ width: 200 }}
                >
                  {getTypeLabel(contract.type)}
                </Dropdown.Toggle>
                <Dropdown.Menu className="border border-dark p-2 lh-lg">
                  {CONTRACT_TYPES.map((type) => (
                    <Dropdown.Item
                      key={type.value}
                      className="fw-semi-bold"
                      onClick={() =>
                        handleChange(
                          index,
                          "type",
                          type.value as SmartContract["type"],
                        )
                      }
                    >
                      {type.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
              <Dropdown>
                <Dropdown.Toggle
                  className="d-flex justify-content-between align-items-center bg-white border border-2 border-dark rounded-4 py-3 px-3 fw-semi-bold text-dark"
                  style={{ width: 160 }}
                >
                  {contract.network}
                </Dropdown.Toggle>
                <Dropdown.Menu className="border border-dark p-2 lh-lg">
                  {networks.map((network) => (
                    <Dropdown.Item
                      key={network.id}
                      className="fw-semi-bold"
                      onClick={() =>
                        handleChange(index, "network", network.name)
                      }
                    >
                      <Stack direction="horizontal" gap={1}>
                        <Image
                          src={network.icon}
                          alt="Network Icon"
                          width={16}
                          height={16}
                        />
                        {network.name}
                      </Stack>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            </Stack>
            <Stack direction="horizontal" gap={2}>
              <Form.Control
                type="text"
                value={contract.address}
                placeholder=""
                className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
                isInvalid={isAddressInvalid(contract.address)}
                onChange={(e) => handleChange(index, "address", e.target.value)}
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
