import { useState } from "react";
import { Address, parseEther, formatEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import useAdminParams from "@/hooks/adminParams";
import { getApolloClient } from "@/lib/apollo";
import { isNumber } from "@/lib/utils";
import { networks } from "@/lib/networks";
import { strategyAbi } from "@/lib/abi/strategy";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import { SECONDS_IN_MONTH } from "@/lib/constants";

const POOL_BY_ID_QUERY = gql`
  query PoolByIdQuery($poolId: String, $chainId: Int) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        id: { equalTo: $poolId }
        tags: { contains: "allo" }
      }
    ) {
      strategyAddress
      matchingToken
    }
  }
`;

export default function MatchinPool() {
  const [newFlowRate, setNewFlowRate] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { address, chain: connectedChain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { poolId, chainId } = useAdminParams();
  const network = networks.find((network) => network.id === Number(chainId));
  const publicClient = usePublicClient();
  const { data: queryRes, loading } = useQuery(POOL_BY_ID_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      poolId,
      chainId,
    },
    skip: !poolId,
  });
  const { data: gdaPool } = useReadContract({
    address: queryRes?.pools[0].strategyAddress,
    abi: strategyAbi,
    functionName: "gdaPool",
  });
  const { data: currentFlowRate } = useReadContract({
    address: network?.gdaForwarder,
    abi: gdaForwarderAbi,
    functionName: "getFlowDistributionFlowRate",
    args: [
      queryRes?.pools[0].matchingToken as Address,
      address as Address,
      gdaPool as Address,
    ],
    query: { refetchInterval: 5000 },
  });

  const handleStreamUpdate = async () => {
    if (!network || !queryRes || !address || !gdaPool || !publicClient) {
      return;
    }

    try {
      setIsTransactionLoading(true);

      const hash = await writeContractAsync({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "distributeFlow",
        args: [
          queryRes.pools[0].matchingToken,
          address,
          gdaPool,
          parseEther(newFlowRate) / BigInt(SECONDS_IN_MONTH),
          "0x",
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      setIsTransactionLoading(false);
      setNewFlowRate("");
    } catch (err) {
      console.error(err);

      setIsTransactionLoading(false);
    }
  };

  return (
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      {!poolId ? (
        <>Pool not found</>
      ) : connectedChain?.id !== network?.id ? (
        <>Wrong network</>
      ) : (
        <>
          <Card.Text as="h1">Distribute funds to Matching Pool</Card.Text>
          {loading ? (
            <Spinner className="m-auto" />
          ) : (
            <Form>
              <Form.Group className="mb-4">
                <Form.Label>Matching Pool Address</Form.Label>
                <InputGroup className="gap-3 mb-3 w-75">
                  <Form.Control
                    type="text"
                    value={gdaPool ?? ""}
                    disabled
                    className="rounded-2"
                  />
                  <Button
                    variant="secondary"
                    as="a"
                    href={`${network?.superfluidConsole}/pools/${gdaPool}`}
                    target="_blank"
                    className="rounded-2 text-light"
                  >
                    View on Console
                  </Button>
                </InputGroup>
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Current Funding Rate</Form.Label>
                <InputGroup className="mb-3 w-50">
                  <Form.Control
                    type="text"
                    value={
                      !currentFlowRate && currentFlowRate !== BigInt(0)
                        ? "N/A"
                        : parseFloat(
                            Number(
                              formatEther(
                                currentFlowRate * BigInt(SECONDS_IN_MONTH),
                              ),
                            ).toFixed(8),
                          )
                    }
                    disabled
                    className="rounded-2"
                  />
                  <InputGroup.Text className="bg-transparent border-0">
                    {
                      network?.tokens.find(
                        (token) =>
                          token.address.toLowerCase() ===
                          queryRes?.pools[0].matchingToken,
                      )?.name
                    }
                    /month
                  </InputGroup.Text>
                </InputGroup>
              </Form.Group>
              <Form.Group className="mb-5">
                <Form.Label>New Funding Rate</Form.Label>
                <InputGroup className="w-50">
                  <Form.Control
                    type="text"
                    value={newFlowRate}
                    onChange={(e) => {
                      const { value } = e.target;
                      if (isNumber(value) || value === "" || value === ".") {
                        setNewFlowRate(value);
                      }
                    }}
                    className="rounded-2"
                  />
                  <InputGroup.Text className="bg-transparent border-0">
                    {
                      network?.tokens.find(
                        (token) =>
                          token.address.toLowerCase() ===
                          queryRes?.pools[0].matchingToken,
                      )?.name
                    }
                    /month
                  </InputGroup.Text>
                </InputGroup>
              </Form.Group>
              <Button
                className="w-20 text-light"
                disabled={
                  !newFlowRate ||
                  !network ||
                  !queryRes ||
                  !address ||
                  !gdaPool ||
                  !publicClient
                }
                onClick={handleStreamUpdate}
              >
                {isTransactionLoading ? <Spinner size="sm" /> : "Update Stream"}
              </Button>
            </Form>
          )}
        </>
      )}
    </Stack>
  );
}
