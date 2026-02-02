"use client";

import { useState } from "react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import { isAddress } from "viem";
import { networks } from "@/lib/networks";
import { SmartContract } from "@/types/project";

export type { SmartContract };

// Custom network list for smart contracts dropdown
const SMART_CONTRACT_NETWORKS = [
  { id: 1, name: "Ethereum", icon: "/eth.png" },
  ...networks.filter((n) => n.name !== "OP Sepolia"),
];

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

  const [touchedAddresses, setTouchedAddresses] = useState<Set<number>>(
    new Set(),
  );

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
      {
        type: "projectAddress",
        network: SMART_CONTRACT_NETWORKS[0]?.name ?? "",
        address: "",
      },
    ]);
  };

  const handleRemove = (index: number) => {
    const newContracts = contracts.filter((_, i) => i !== index);
    onChange(newContracts);
    setTouchedAddresses((prev) => {
      const newSet = new Set<number>();
      prev.forEach((i) => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  };

  const isAddressInvalid = (address: string, index: number) => {
    if (!validated && !touchedAddresses.has(index)) return false;
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
                  {SMART_CONTRACT_NETWORKS.map((network) => (
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
                placeholder="0x123..."
                className={`bg-white border border-2 rounded-4 py-3 px-3 ${isAddressInvalid(contract.address, index) ? "border-danger" : "border-dark"}`}
                isInvalid={isAddressInvalid(contract.address, index)}
                onChange={(e) => handleChange(index, "address", e.target.value)}
                onBlur={() =>
                  setTouchedAddresses((prev) => new Set(prev).add(index))
                }
              />
              <Form.Control.Feedback type="invalid">
                Please enter a valid ETH address
              </Form.Control.Feedback>
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
