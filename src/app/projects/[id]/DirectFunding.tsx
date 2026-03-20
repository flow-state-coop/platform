"use client";

import { useState } from "react";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { networks } from "@/lib/networks";
import useStreamFunding from "./useStreamFunding";
import {
  FlowRateMetrics,
  TokenDropdown,
  StreamInputs,
} from "./GardensPoolFunding";

const TESTNET_CHAIN_IDS = [11155420, 11155111];
const CELO_CHAIN_ID = 42220;

const mainnetNetworks = networks.filter(
  (n) => !TESTNET_CHAIN_IDS.includes(n.id),
);

const defaultNetwork =
  mainnetNetworks.find((n) => n.id === CELO_CHAIN_ID) ?? mainnetNetworks[0];

type DirectFundingProps = {
  receiverAddress: string;
};

export default function DirectFunding({ receiverAddress }: DirectFundingProps) {
  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);

  const stream = useStreamFunding(selectedNetwork, receiverAddress);

  const handleNetworkChange = (net: Network) => {
    setSelectedNetwork(net);
    stream.setSelectedToken(net.tokens[0]);
    stream.resetInputs();
  };

  return (
    <Card
      className="border-0 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(var(--bs-primary-rgb), 0.04), rgba(var(--bs-primary-rgb), 0.01))",
        boxShadow:
          "0 0 0 1px rgba(var(--bs-primary-rgb), 0.15), 0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      <Card.Body className="p-5">
        <span className="fw-bold fs-lg d-block mb-5">Fund Project</span>

        <Stack direction="vertical" gap={3}>
          <FlowRateMetrics stream={stream} />
          <NetworkDropdown
            networks={mainnetNetworks}
            selected={selectedNetwork}
            onSelect={handleNetworkChange}
          />
          <TokenDropdown
            tokens={selectedNetwork.tokens}
            selected={stream.selectedToken}
            onSelect={(token: Token) => {
              stream.setSelectedToken(token);
              stream.setWrapAmount("");
            }}
          />
          <StreamInputs stream={stream} network={selectedNetwork} />
        </Stack>
      </Card.Body>
    </Card>
  );
}

function NetworkDropdown({
  networks,
  selected,
  onSelect,
}: {
  networks: Network[];
  selected: Network;
  onSelect: (network: Network) => void;
}) {
  return (
    <Dropdown>
      <Dropdown.Toggle
        variant="outline-secondary"
        className="w-100 d-flex align-items-center justify-content-between rounded-3"
      >
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Image
            src={selected.icon}
            alt=""
            width={20}
            height={20}
            className="rounded-circle"
          />
          {selected.name}
        </Stack>
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-100">
        {networks.map((net) => (
          <Dropdown.Item
            key={net.id}
            active={net.id === selected.id}
            onClick={() => onSelect(net)}
          >
            <Stack
              direction="horizontal"
              gap={2}
              className="align-items-center"
            >
              <Image
                src={net.icon}
                alt=""
                width={20}
                height={20}
                className="rounded-circle"
              />
              {net.name}
            </Stack>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
