"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, encodeFunctionData, formatEther } from "viem";
import {
  useAccount,
  useWriteContract,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import {
  ReactFlow,
  Background,
  Node,
  NodeProps,
  Edge,
  EdgeProps,
  Position,
  NodeToolbar,
  BaseEdge,
  Handle,
  getStraightPath,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";
import { Network } from "@/types/network";
import { GDAPool } from "@/types/gdaPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { truncateStr, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { superfluidHostAbi } from "@/lib/abi/superfluidHost";
import { gdaAbi } from "@/lib/abi/gda";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import "@xyflow/react/dist/style.css";

type PoolGraphProps = {
  pool: GDAPool;
  chainId: number;
  network?: Network;
  ensByAddress: {
    [key: Address]: { name: string | null; avatar: string | null };
  } | null;
};

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
const nodeWidth = 60;
const nodeHeight = 60;

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction = "TB",
) => {
  const isHorizontal = direction === "LR";

  dagreGraph.setGraph({ rankdir: direction });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

type ConnectStatus = "idle" | "pending" | "success" | "error" | "slots-full";

function CustomNode(props: NodeProps<Node>) {
  const { selected, data } = props;

  const [showToolbar, setShowToolbar] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");

  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const totalFlowed = useFlowingAmount(
    BigInt((data?.totalAmountFlowedDistributedUntilUpdatedAt as string) ?? 0) +
      BigInt(
        (data?.totalAmountInstantlyDistributedUntilUpdatedAt as string) ?? 0,
      ),
    (data?.updatedAtTimestamp as number) ?? 0,
    BigInt((data?.flowRate as string) ?? 0),
  );

  useEffect(() => {
    if (connectStatus === "success" || connectStatus === "error") {
      const timeout = setTimeout(() => setConnectStatus("idle"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [connectStatus]);

  const network = data.network as Network | undefined;

  const handleTryConnect = useCallback(async () => {
    if (!network || !publicClient) return;

    try {
      setConnectStatus("pending");

      if (connectedChain?.id !== data.chainId) {
        await switchChainAsync({ chainId: data.chainId as number });
      }

      const callData = encodeFunctionData({
        abi: gdaAbi,
        functionName: "tryConnectPoolFor",
        args: [
          data.poolAddress as Address,
          data.address as Address,
          "0x" as `0x${string}`,
        ],
      });

      const hash = await writeContractAsync({
        address: network.superfluidHost,
        abi: superfluidHostAbi,
        functionName: "callAgreement",
        args: [network.gda, callData, "0x"],
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      const isConnected = await publicClient.readContract({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "isMemberConnected",
        args: [data.poolAddress as Address, data.address as Address],
      });

      if (isConnected) {
        setConnectStatus("success");
      } else {
        setConnectStatus("slots-full");
      }
    } catch (err) {
      console.error(err);
      setConnectStatus("error");
    }
  }, [
    network,
    publicClient,
    writeContractAsync,
    switchChainAsync,
    connectedChain?.id,
    data.chainId,
    data.poolAddress,
    data.address,
  ]);

  const statusOverlay =
    connectStatus === "pending" ? (
      <div
        className="position-absolute top-0 start-0 d-flex align-items-center justify-content-center rounded-circle"
        style={{
          width: 42,
          height: 42,
          backgroundColor: "rgba(255,255,255,0.7)",
        }}
      >
        <Spinner size="sm" />
      </div>
    ) : connectStatus === "success" ? (
      <div
        className="position-absolute top-0 start-0 d-flex align-items-center justify-content-center rounded-circle"
        style={{
          width: 42,
          height: 42,
          backgroundColor: "rgba(255,255,255,0.7)",
          color: "green",
          fontSize: "1.2rem",
          fontWeight: "bold",
        }}
      >
        &#10003;
      </div>
    ) : connectStatus === "error" ? (
      <div
        className="position-absolute top-0 start-0 d-flex align-items-center justify-content-center rounded-circle"
        style={{
          width: 42,
          height: 42,
          backgroundColor: "rgba(255,255,255,0.7)",
          color: "red",
          fontSize: "1.2rem",
          fontWeight: "bold",
        }}
      >
        &#10007;
      </div>
    ) : null;

  if (data.isPool) {
    return (
      <div
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
      >
        <Stack
          direction="vertical"
          gap={1}
          className="align-items-center p-3 rounded-4 cursor-pointer bg-lace-100 shadow"
        >
          <span style={{ fontSize: "0.8rem", fontWeight: "bold" }}>
            {data?.label?.toString() ?? ""}
          </span>
          <span style={{ fontSize: "0.6rem" }}>
            Total{" "}
            {`${formatNumber(
              Number(formatEther(totalFlowed)),
            )} ${(data.token as { symbol: string }).symbol}`}
          </span>
        </Stack>
        <Handle className="invisible" type="target" position={Position.Top} />
        <Handle
          className="invisible"
          type="source"
          position={Position.Bottom}
        />
        <NodeToolbar
          isVisible={showToolbar || (!!data.isMobile && selected)}
          position={Position.Right}
          offset={0}
        >
          <Stack direction="vertical" gap={2}>
            <Button
              variant="light"
              onClick={() =>
                navigator.clipboard.writeText(data?.address?.toString() ?? "0x")
              }
              className="border border-4 border-dark fw-semi-bold"
            >
              Copy address
            </Button>
            <Button
              variant="light"
              href={`https://explorer.superfluid.finance/${data.chainId}/pools/${data.address}`}
              target="_blank"
              className="border border-4 border-dark fw-semi-bold"
            >
              View in Explorer
            </Button>
          </Stack>
        </NodeToolbar>
      </div>
    );
  }

  const isMember = !data.isDistributor;
  const isConnected = data.isConnected as boolean | undefined;

  const connectButton =
    isMember && isConnected !== undefined ? (
      isConnected || connectStatus === "success" ? (
        <Button
          variant="light"
          disabled
          className="border border-4 border-dark fw-semi-bold"
        >
          Connected
        </Button>
      ) : connectStatus === "slots-full" ? (
        <Button
          variant="light"
          disabled
          className="border border-4 border-dark fw-semi-bold"
        >
          Autoconnect Full
        </Button>
      ) : (
        <Button
          variant="light"
          onClick={handleTryConnect}
          disabled={connectStatus === "pending"}
          className="border border-4 border-dark fw-semi-bold"
        >
          {connectStatus === "pending" ? (
            <Spinner size="sm" />
          ) : (
            "tryConnectPoolFor"
          )}
        </Button>
      )
    ) : null;

  return (
    <div
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      <Stack
        direction="vertical"
        gap={1}
        className="align-items-center cursor-pointer"
      >
        <div className="position-relative" style={{ width: 42, height: 42 }}>
          {data.avatar ? (
            <Image
              src={(data.avatar as string) ?? ""}
              alt="avatar"
              width={42}
              height={42}
              className="rounded-circle border border-black"
            />
          ) : (
            <Jazzicon
              paperStyles={{ border: "1px solid black" }}
              diameter={42}
              seed={jsNumberForAddress(data.address as `0x${string}`)}
            />
          )}
          {statusOverlay}
        </div>
        <span className="fw-semi-bold" style={{ fontSize: "0.7rem" }}>
          {data?.label?.toString() ?? ""}
        </span>
        {data.isDistributor ? (
          <span>{`${parseFloat(((data.percentage as number) * 100).toFixed(2))}%`}</span>
        ) : (
          <span>{`${parseFloat(((Number(data.units) / Number(data.totalUnits)) * 100).toFixed(2))}%`}</span>
        )}
      </Stack>
      <Handle className="invisible" type="target" position={Position.Top} />
      <Handle className="invisible" type="source" position={Position.Bottom} />
      <NodeToolbar
        isVisible={showToolbar || (!!data.isMobile && selected)}
        position={data.isDistributor ? Position.Bottom : Position.Top}
        offset={0}
      >
        <Stack direction="vertical" gap={2}>
          {data.isDistributor ? (
            <Stack
              direction="vertical"
              gap={1}
              className="bg-light border border-4 border-dark rounded-2 p-2 text-center fw-semi-bold"
            >
              {formatNumber(
                Number(
                  formatEther(
                    BigInt(data.flowRate as string) * BigInt(SECONDS_IN_MONTH),
                  ),
                ),
              )}
              /mo = {parseFloat(((data.percentage as number) * 100).toFixed(2))}
              %
            </Stack>
          ) : (
            <Stack
              direction="vertical"
              gap={1}
              className="bg-light border border-4 border-dark rounded-2 p-2 text-center fw-semi-bold"
            >
              <span>
                {data.units as string}{" "}
                {Number(data.units) === 1 ? "Unit" : "Units"} ={" "}
                {parseFloat(
                  (
                    (Number(data.units) / Number(data.totalUnits)) *
                    100
                  ).toFixed(2),
                )}
                %
              </span>
              <span style={{ fontSize: "0.7rem" }}>
                Current:{" "}
                {formatNumber(
                  Number(
                    formatEther(
                      BigInt(data.flowRate as string) *
                        BigInt(SECONDS_IN_MONTH),
                    ),
                  ),
                )}{" "}
                {(data.token as { symbol: string }).symbol}/mo
              </span>
            </Stack>
          )}
          {connectButton}
          <Button
            variant="light"
            className="border border-4 border-dark fw-semi-bold"
            onClick={() =>
              navigator.clipboard.writeText(data?.address?.toString() ?? "0x")
            }
          >
            Copy address
          </Button>
          <Button
            variant="light"
            href={`https://explorer.superfluid.finance/${data.chainId}/accounts/${data.address}`}
            target="_blank"
            className="border border-4 border-dark fw-semi-bold"
          >
            View in Explorer
          </Button>
        </Stack>
      </NodeToolbar>
    </div>
  );
}

function CustomEdge(props: EdgeProps<Edge>) {
  const { id, sourceX, sourceY, targetX, targetY } = props;

  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        strokeWidth: 2,
      }}
    />
  );
}

export default function PoolGraph(props: PoolGraphProps) {
  const { pool, chainId, network, ensByAddress } = props;

  const { isMobile, isTablet } = useMediaQuery();

  const graph = useMemo(() => {
    if (!pool) {
      return { nodes: [], edges: [] };
    }

    const nodesFromPoolDistributors = pool.poolDistributors
      .map((x) => [
        {
          id: `${x.account.id}-distributor`,
          position: { x: 0, y: 0 },
          type: "custom",
          data: {
            label:
              ensByAddress?.[x.account.id]?.name ??
              truncateStr(x.account.id, 11),
            avatar: ensByAddress?.[x.account.id]?.avatar,
            address: x.account.id,
            flowRate: BigInt(x.flowRate),
            percentage:
              Number(formatEther(BigInt(x.flowRate))) /
              Number(formatEther(BigInt(pool.flowRate))),
            isDistributor: true,
            isMobile: isMobile || isTablet,
            chainId,
          },
        },
      ])
      .flat();

    const nodesFromPoolMembers = pool.poolMembers
      .filter((member) => member.units !== "0")
      .map((x) => [
        {
          id: `${x.account.id}-member`,
          position: { x: 0, y: 0 },
          type: "custom",
          data: {
            label:
              ensByAddress?.[x.account.id]?.name ??
              truncateStr(x.account.id, 11),
            avatar: ensByAddress?.[x.account.id]?.avatar,
            address: x.account.id,
            units: x.units,
            totalUnits: pool.totalUnits,
            token: { address: pool.token.id, symbol: pool.token.symbol },
            flowRate:
              BigInt(pool.totalUnits) > 0
                ? (BigInt(pool.flowRate) * BigInt(x.units)) /
                  BigInt(pool.totalUnits)
                : BigInt(0),
            isConnected: x.isConnected,
            poolAddress: pool.id,
            network,
            isMobile: isMobile || isTablet,
            chainId,
          },
        },
      ])
      .flat();

    const edgesFromPoolDistributors = pool.poolDistributors
      .map((x) => [
        {
          id: `${pool.token.id}-${x.account.id}-distributor-${pool.id}`,
          source: `${x.account.id}-distributor`,
          target: pool.id,
          type: "custom",
          data: {
            flowRate: BigInt(x.flowRate),
          },
        },
      ])
      .flat();

    const edgesFromPoolMembers = pool.poolMembers
      .map((x) => [
        {
          id: `${pool.token.id}-${pool.id}-${x.account.id}-member`,
          source: pool.id,
          target: `${x.account.id}-member`,
          type: "custom",
          data: {
            flowRate:
              BigInt(pool.totalUnits) > 0
                ? (BigInt(pool.flowRate) * BigInt(x.units)) /
                  BigInt(pool.totalUnits)
                : BigInt(0),
          },
        },
      ])
      .flat();

    const { nodes, edges } = getLayoutedElements(
      [
        ...nodesFromPoolDistributors,
        {
          id: pool.id,
          position: { x: 0, y: 0 },
          type: "custom",
          data: {
            address: pool.id,
            isPool: true,
            label: `${formatNumber(
              Number(
                formatEther(BigInt(pool.flowRate) * BigInt(SECONDS_IN_MONTH)),
              ),
            )} ${pool.token.symbol}/mo`,
            token: { address: pool.token.id, symbol: pool.token.symbol },
            flowRate: pool.flowRate,
            totalAmountFlowedDistributedUntilUpdatedAt:
              pool.totalAmountFlowedDistributedUntilUpdatedAt,
            totalAmountInstantlyDistributedUntilUpdatedAt:
              pool.totalAmountInstantlyDistributedUntilUpdatedAt,
            updatedAtTimestamp: pool.updatedAtTimestamp,
            isMobile: isMobile || isTablet,
            chainId,
          },
        },
        ...nodesFromPoolMembers,
      ].flat(),
      [...edgesFromPoolDistributors, edgesFromPoolMembers].flat(),
    );

    return { nodes, edges };
  }, [pool, chainId, network, ensByAddress, isMobile, isTablet]);

  return (
    <div
      style={{
        width: "100%",
        height: "50vh",
        margin: "auto",
      }}
    >
      <ReactFlow
        defaultNodes={graph.nodes}
        defaultEdges={graph.edges}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ animated: true }}
        fitView
        colorMode="light"
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={1.7}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
