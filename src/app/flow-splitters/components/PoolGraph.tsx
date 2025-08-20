"use client";

import { useMemo } from "react";
import { Address, formatEther } from "viem";
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
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";
import { GDAPool } from "@/types/gdaPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { truncateStr, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import "@xyflow/react/dist/style.css";

type PoolGraphProps = {
  pool: GDAPool;
  chainId: number;
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

function CustomNode(props: NodeProps<Node>) {
  const { selected, data } = props;

  const totalFlowed = useFlowingAmount(
    BigInt((data?.totalAmountFlowedDistributedUntilUpdatedAt as string) ?? 0) +
      BigInt(
        (data?.totalAmountInstantlyDistributedUntilUpdatedAt as string) ?? 0,
      ),
    (data?.updatedAtTimestamp as number) ?? 0,
    BigInt((data?.flowRate as string) ?? 0),
  );

  if (data.isPool) {
    return (
      <>
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
        <NodeToolbar isVisible={selected} position={Position.Right}>
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
      </>
    );
  }

  return (
    <>
      <Stack
        direction="vertical"
        gap={1}
        className="align-items-center cursor-pointer"
      >
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
        isVisible={selected}
        position={data.isDistributor ? Position.Bottom : Position.Top}
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
    </>
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
  const { pool, chainId, ensByAddress } = props;

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
            chainId,
          },
        },
        ...nodesFromPoolMembers,
      ].flat(),
      [...edgesFromPoolDistributors, edgesFromPoolMembers].flat(),
    );

    return { nodes, edges };
  }, [pool, chainId, ensByAddress]);

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
