"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, parseEventLogs, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery, useLazyQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Toast from "react-bootstrap/Toast";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Sidebar from "../components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { getApolloClient } from "@/lib/apollo";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { networks } from "@/lib/networks";
import { flowCouncilFactoryAbi } from "@/lib/abi/flowCouncilFactory";
import { pinJsonToIpfs } from "@/lib/ipfs";

type LaunchProps = { defaultNetwork: Network; flowCouncilId?: string };

type CustomTokenEntry = {
  address: string;
  symbol: string;
  validationError: string;
};

const SUPERTOKEN_QUERY = gql`
  query SupertokenQuery($token: String!) {
    token(id: $token) {
      id
      isSuperToken
      symbol
    }
  }
`;

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($flowCouncilId: String!) {
    flowCouncil(id: $flowCouncilId) {
      id
      metadata
      superToken
    }
  }
`;

export default function Launch(props: LaunchProps) {
  const { defaultNetwork, flowCouncilId } = props;

  const [flowCouncilMetadata, setFlowCouncilMetadata] = useState({
    name: "",
    description: "",
  });
  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [selectedToken, setSelectedToken] = useState<Token>();
  const [customTokenSelection, setCustomTokenSelection] = useState(false);
  const [customTokenEntry, setCustomTokenEntry] = useState<CustomTokenEntry>({
    address: "",
    symbol: "",
    validationError: "",
  });
  const [success, setSuccess] = useState(false);
  const [transactionerror, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const {
    data: flowCouncilQueryRes,
    loading: flowCouncilQueryResLoading,
    refetch: refetchFlowCouncilQuery,
  } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", selectedNetwork.id),
    variables: { flowCouncilId: flowCouncilId?.toLowerCase() },
    pollInterval: 4000,
    skip: !flowCouncilId,
  });
  const [checkSuperToken] = useLazyQuery(SUPERTOKEN_QUERY, {
    client: getApolloClient("superfluid", selectedNetwork.id),
  });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil;

  useEffect(() => {
    (async () => {
      if (!flowCouncil) {
        return;
      }

      const metadata = await fetchIpfsJson(flowCouncil.metadata);

      if (metadata) {
        setFlowCouncilMetadata({
          name: metadata.name,
          description: metadata.description,
        });
      }

      const supportedToken = selectedNetwork.tokens.find(
        (token) => token.address.toLowerCase() === flowCouncil.superToken,
      );

      if (supportedToken) {
        setSelectedToken(supportedToken);
      } else {
        const { data: superTokenQueryRes } = await checkSuperToken({
          variables: { token: flowCouncil.distributionToken },
        });

        setCustomTokenEntry({
          address: flowCouncil.distributionToken,
          symbol: superTokenQueryRes?.token.symbol ?? "N/A",
          validationError: "",
        });
        setCustomTokenSelection(true);
      }
    })();
  }, [flowCouncil, selectedNetwork, checkSuperToken]);

  const handleSubmit = async () => {
    if (!address || !publicClient) {
      return;
    }

    const token = customTokenSelection
      ? (customTokenEntry.address as Address)
      : selectedToken
        ? selectedToken.address
        : selectedNetwork.tokens[0].address;

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const { IpfsHash: metadataCid } = await pinJsonToIpfs({
        name: flowCouncilMetadata.name,
        description: flowCouncilMetadata.description,
      });
      const hash = await writeContract(wagmiConfig, {
        address: selectedNetwork.flowCouncilFactory as Address,
        abi: flowCouncilFactoryAbi,
        functionName: "createFlowCouncil",
        args: [metadataCid, token],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });
      const flowCouncilId = parseEventLogs({
        abi: flowCouncilFactoryAbi,
        eventName: ["FlowCouncilCreated"],
        logs: receipt.logs,
      })[0].args.flowCouncil;

      await refetchFlowCouncilQuery({ variables: { flowCouncilId } });

      router.push(
        `/flow-councils/launch/?chainId=${selectedNetwork.id}&id=${flowCouncilId}`,
      );
      router.refresh();

      setIsTransactionLoading(false);
      setSuccess(true);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  if (flowCouncilId && !flowCouncilQueryResLoading && !flowCouncil) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Flow Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-light rounded-4 border-0 mt-4 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-4">
            Flow Council Metadata
          </Card.Header>
          <Card.Body className="p-0 mt-2">
            <Form.Control
              type="text"
              placeholder="Name"
              value={flowCouncilMetadata.name}
              disabled={!!flowCouncilId}
              style={{
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setFlowCouncilMetadata({
                  ...flowCouncilMetadata,
                  name: e.target.value,
                })
              }
            />
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Description (Supports Markdown)"
              value={flowCouncilMetadata.description}
              disabled={!!flowCouncilId}
              className="mt-3"
              style={{
                resize: "none",
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setFlowCouncilMetadata({
                  ...flowCouncilMetadata,
                  description: e.target.value,
                })
              }
            />
          </Card.Body>
        </Card>
        <Card className="bg-light rounded-4 border-0 mt-4 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-4">
            Set Distribution
          </Card.Header>
          <Card.Body className="p-0">
            <Card.Text className="text-info">
              Select the token you will distribute through your Flow Council.
            </Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                disabled={!!flowCouncilId}
                className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
                style={{ width: 256, paddingTop: 12, paddingBottom: 12 }}
              >
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="align-items-center"
                >
                  <Image
                    src={selectedNetwork.icon}
                    alt="Network Icon"
                    width={18}
                    height={18}
                  />
                  {selectedNetwork.name}
                </Stack>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {networks.map((network, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      setSelectedNetwork(network);
                      setSelectedToken(network.tokens[0]);
                      router.push(
                        `/flow-councils/launch/?chainId=${network.id}`,
                      );
                    }}
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
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 1 : 3}
              className="align-items-start mt-2"
            >
              <Dropdown>
                <Dropdown.Toggle
                  disabled={!!flowCouncilId}
                  className="d-flex justify-content-between align-items-center bg-white text-dark border border-2"
                  style={{ width: 256, paddingTop: 12, paddingBottom: 12 }}
                >
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="align-items-center"
                  >
                    {!customTokenSelection && (
                      <Image
                        src={
                          selectedToken?.icon ?? selectedNetwork.tokens[0].icon
                        }
                        alt="Token"
                        width={18}
                        height={18}
                      />
                    )}
                    {customTokenSelection && customTokenEntry?.symbol
                      ? customTokenEntry.symbol
                      : customTokenSelection
                        ? "Custom"
                        : (selectedToken?.symbol ??
                          selectedNetwork.tokens[0].symbol)}
                  </Stack>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {selectedNetwork.tokens.map((token, i) => (
                    <Dropdown.Item
                      key={i}
                      onClick={() => {
                        setCustomTokenSelection(false);
                        setSelectedToken(token);
                      }}
                    >
                      <Stack direction="horizontal" gap={1}>
                        <Image
                          src={token.icon}
                          alt="Token Icon"
                          width={16}
                          height={16}
                        />
                        {token.symbol}
                      </Stack>
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item onClick={() => setCustomTokenSelection(true)}>
                    Custom
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              {customTokenSelection ? (
                <Stack
                  direction="vertical"
                  className="position-relative align-self-sm-end"
                >
                  <Form.Control
                    type="text"
                    value={customTokenEntry.address}
                    disabled={!!flowCouncilId}
                    style={{
                      width: !isMobile ? "50%" : "",
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={async (e) => {
                      const value = e.target.value;

                      let validationError = "";
                      let symbol = "";

                      if (!isAddress(value)) {
                        validationError = "Invalid Address";
                      } else {
                        const { data: superTokenQueryRes } =
                          await checkSuperToken({
                            variables: { token: value.toLowerCase() },
                          });

                        if (!superTokenQueryRes?.token?.isSuperToken) {
                          validationError = "Not a SuperToken";
                        } else {
                          symbol = superTokenQueryRes.token.symbol;
                        }
                      }

                      setCustomTokenEntry({
                        ...customTokenEntry,
                        address: value,
                        symbol,
                        validationError,
                      });
                    }}
                  />
                  {customTokenEntry.validationError && (
                    <Card.Text
                      className="position-absolute mb-0 ms-2 ps-1 text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {customTokenEntry.validationError}
                    </Card.Text>
                  )}
                </Stack>
              ) : (
                <Stack direction="vertical" className="align-self-sm-end">
                  <Form.Control
                    type="text"
                    disabled
                    value={
                      selectedToken?.address ??
                      selectedNetwork.tokens[0].address
                    }
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                  />
                </Stack>
              )}
            </Stack>
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="my-4">
          <Button
            disabled={
              !!flowCouncilId ||
              !flowCouncilMetadata.name ||
              !flowCouncilMetadata.description ||
              (customTokenSelection && !!customTokenEntry.validationError)
            }
            className="fs-5"
            onClick={() =>
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== selectedNetwork.id
                  ? switchChain({ chainId: selectedNetwork.id })
                  : handleSubmit()
            }
          >
            {isTransactionLoading ? (
              <Spinner size="sm" className="ms-2" />
            ) : (
              "Launch"
            )}
          </Button>
          <Button
            variant="secondary"
            disabled={!flowCouncilId}
            className="fs-5"
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(
                `/flow-councils/permissions/?chainId=${selectedNetwork.id}&id=${flowCouncilId}`,
              )
            }
          >
            Next
          </Button>
          <Toast
            show={success}
            delay={4000}
            autohide={true}
            onClose={() => setSuccess(false)}
            className="w-100 bg-success p-3 fs-5 text-light"
          >
            Success!
          </Toast>
          {transactionerror ? (
            <Alert variant="danger" className="w-100">
              {transactionerror}
            </Alert>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}
