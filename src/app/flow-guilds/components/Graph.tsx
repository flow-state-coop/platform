"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
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
import { Token } from "@/types/token";
import { GDAPool } from "@/types/gdaPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { networks } from "@/lib/networks";
import { truncateStr, formatNumber } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { FlowGuildConfig } from "../lib/flowGuildConfig";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import "@xyflow/react/dist/style.css";

type GraphProps = {
  flowGuildConfig: FlowGuildConfig;
  token: Token;
  pool: GDAPool;
  safeInflowRate: `${number}`;
  totalDonors: number;
  chainId: number;
  ensByAddress: {
    [key: string]: { name: string | null; avatar: string | null };
  } | null;
  showProjectDetails: () => void;
};

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
const nodeWidth = 100;
const nodeHeight = 100;

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

  const router = useRouter();
  const network = networks.find((network) => network.id === data.chainId);
  const totalFlowed = useFlowingAmount(
    BigInt((data?.totalAmountFlowedDistributedUntilUpdatedAt as string) ?? 0) +
      BigInt(
        (data?.totalAmountInstantlyDistributedUntilUpdatedAt as string) ?? 0,
      ),
    (data?.updatedAtTimestamp as number) ?? 0,
    BigInt((data?.flowRate as string) ?? 0),
  );

  if (data.isSafeDonor) {
    return (
      <>
        <Stack
          direction="vertical"
          gap={1}
          className="align-items-center bg-white p-3 rounded-4 cursor-pointer shadow"
          style={{ width: 230 }}
        >
          <span style={{ fontSize: "0.8rem", fontWeight: "bold" }}>
            {data?.label?.toString() ?? ""}
          </span>
          <span style={{ fontSize: "0.7rem" }}>
            {`${formatNumber(
              Number(
                formatEther(
                  (data.flowRate as bigint) * BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )} ${(data.token as { symbol: string }).symbol}/mo`}
          </span>
        </Stack>
        <Handle className="invisible" type="target" position={Position.Top} />
        <Handle
          className="invisible"
          type="source"
          position={Position.Bottom}
        />
      </>
    );
  }

  if (data.isSafe) {
    return (
      <>
        <Stack
          direction="horizontal"
          className="align-items-center bg-white p-3 rounded-4 cursor-pointer shadow"
          style={{ width: 230 }}
        >
          <Image src={data.logo as string} alt="Logo" width={42} height={42} />
          <Stack direction="vertical" gap={1} className="align-items-center">
            <span style={{ fontSize: "0.8rem", fontWeight: "bold" }}>
              {data?.label?.toString() ?? ""}
            </span>
            <span style={{ fontSize: "0.7rem" }}>
              {truncateStr(data.address as string, 12)}
            </span>
          </Stack>
          {!!data?.isMobile && (
            <Button
              variant="transparent"
              className="position-absolute end-0 bottom-0 pe-2"
            >
              <Image src="/info-dark.svg" alt="Info" width={20} height={20} />
            </Button>
          )}
        </Stack>
        <Handle className="invisible" type="target" position={Position.Top} />
        <Handle
          className="invisible"
          type="source"
          position={Position.Bottom}
        />
        <NodeToolbar
          isVisible={selected}
          position={data.isMobile ? Position.Bottom : Position.Right}
        >
          <Stack direction="vertical" gap={2}>
            {!!data.isMobile && (
              <Button
                variant="light"
                onClick={data?.showProjectDetails as () => void}
                className="border border-dark"
              >
                Project Details
              </Button>
            )}
            <Button
              variant="light"
              onClick={() =>
                navigator.clipboard.writeText(data?.address?.toString() ?? "0x")
              }
              className="border border-dark"
            >
              Copy address
            </Button>
            <Button
              variant="light"
              href={`https://explorer.superfluid.finance/${data.chainId}/accounts/${data.address}`}
              target="_blank"
              className="border border-dark"
            >
              View in Explorer
            </Button>
          </Stack>
        </NodeToolbar>
      </>
    );
  }

  if (data.isPool) {
    return (
      <>
        <Stack
          direction="horizontal"
          className="align-items-center bg-white p-3 rounded-4 cursor-pointer shadow"
          style={{ width: 230 }}
        >
          {network && (
            <Image
              src={`${network.icon}`}
              alt="Network"
              width={42}
              height={42}
            />
          )}
          <Stack direction="vertical" gap={1} className="align-items-center">
            <span
              className="align-self-center"
              style={{ fontSize: "0.8rem", fontWeight: "bold" }}
            >
              {data?.label?.toString() ?? ""}
            </span>
            <span style={{ fontSize: "0.7rem" }}>
              Total{" "}
              {`${formatNumber(
                Number(formatEther(totalFlowed)),
              )} ${(data.token as { symbol: string }).symbol}`}
            </span>
          </Stack>
        </Stack>
        <Handle className="invisible" type="target" position={Position.Top} />
        <Handle
          className="invisible"
          type="source"
          position={Position.Bottom}
        />
        <NodeToolbar
          isVisible={selected}
          position={data.isMobile ? Position.Bottom : Position.Right}
        >
          <Stack direction="vertical" gap={2}>
            <Button
              variant="light"
              onClick={() =>
                navigator.clipboard.writeText(data?.address?.toString() ?? "0x")
              }
              className="border border-dark"
            >
              Copy address
            </Button>
            <Button
              variant="light"
              onClick={() =>
                router.push(
                  `/flow-splitters/${data.chainId}/${data.flowSpitterId}/admin`,
                )
              }
              className="border border-dark"
            >
              Configuration
            </Button>
            <Button
              variant="light"
              href={`https://explorer.superfluid.finance/${data.chainId}/pools/${data.address}`}
              target="_blank"
              className="border border-dark"
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
        style={{ width: 200 }}
      >
        {data.avatar ? (
          <Image
            src={(data.avatar as string) ?? ""}
            alt="avatar"
            width={42}
            height={42}
            className="rounded-circle shadow"
          />
        ) : (
          <Jazzicon
            paperStyles={{ boxShadow: "0 .5rem 1rem rgba($black, .15)" }}
            diameter={42}
            seed={jsNumberForAddress(data.address as `0x${string}`)}
          />
        )}
        <span style={{ fontSize: "0.7rem" }}>
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
              className="bg-light border border-dark rounded-2 p-2 text-center"
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
              className="bg-light border border-dark rounded-2 p-2 text-center"
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
            className="border border-dark"
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
            className="border border-dark"
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

export default function Graph(props: GraphProps) {
  const {
    flowGuildConfig,
    token,
    pool,
    safeInflowRate,
    totalDonors,
    chainId,
    ensByAddress,
    showProjectDetails,
  } = props;

  const { isMobile, isTablet } = useMediaQuery();

  const graph = useMemo(() => {
    const totalDonations = BigInt(safeInflowRate);

    const nodesFromPoolDistributors = pool
      ? pool.poolDistributors
          .filter((distributor) => distributor.flowRate !== "0")
          .map((x) => [
            {
              id: `${x.account.id}-distributor`,
              position: { x: 0, y: 0 },
              type: "custom",
              data: {
                isSafe: x.account.id === flowGuildConfig.safe,
                label:
                  x.account.id === flowGuildConfig.safe
                    ? flowGuildConfig.name
                    : (ensByAddress?.[x.account.id]?.name ??
                      truncateStr(x.account.id, 11)),
                avatar: ensByAddress?.[x.account.id]?.avatar,
                logo:
                  x.account.id === flowGuildConfig.safe
                    ? flowGuildConfig.logo
                    : "",
                address: x.account.id,
                flowRate: BigInt(x.flowRate),
                percentage:
                  Number(formatEther(BigInt(x.flowRate))) /
                  Number(formatEther(BigInt(pool.flowRate))),
                isDistributor: true,
                chainId,
                isMobile: isMobile || isTablet,
                showProjectDetails,
              },
            },
          ])
          .flat()
      : [
          {
            id: `safe`,
            position: { x: 0, y: 0 },
            type: "custom",
            data: {
              isSafe: true,
              label: flowGuildConfig.name,
              logo: flowGuildConfig.logo,
              address: flowGuildConfig.safe,
              flowRate: BigInt(safeInflowRate),
              percentage: 1,
              isDistributor: true,
              chainId,
              isMobile: isMobile || isTablet,
              showProjectDetails,
            },
          },
        ];

    const nodesFromPoolMembers = pool
      ? pool.poolMembers
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
                isMobile: isMobile || isTablet,
              },
            },
          ])
          .flat()
      : [];

    const edgesFromSafeDonors = [
      {
        id: pool ? `donors-${flowGuildConfig.safe}-distributor` : "donors-safe",
        source: `donors`,
        target: pool ? `${flowGuildConfig.safe}-distributor` : "safe",
        type: "custom",
        data: {
          flowRate: totalDonations,
        },
      },
    ];

    const edgesFromPoolDistributors = pool
      ? pool.poolDistributors
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
          .flat()
      : [];

    const edgesFromPoolMembers = pool
      ? pool.poolMembers
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
          .flat()
      : [];

    const { nodes, edges } = getLayoutedElements(
      [
        {
          id: "donors",
          position: { x: 0, y: 0 },
          type: "custom",
          data: {
            isSafeDonor: true,
            label: `${totalDonors} Active Donor${totalDonors !== 1 ? "s" : ""}`,
            token: { address: token.address, symbol: token.symbol },
            flowRate: totalDonations,
            chainId,
            isMobile: isMobile || isTablet,
          },
        },
        ...nodesFromPoolDistributors,
        pool
          ? {
              id: pool.id,
              position: { x: 0, y: 0 },
              type: "custom",
              data: {
                address: pool.id,
                isPool: true,
                label: `${formatNumber(
                  Number(
                    formatEther(
                      BigInt(pool.flowRate) * BigInt(SECONDS_IN_MONTH),
                    ),
                  ),
                )} ${pool.token.symbol}/mo`,
                token: { address: token.address, symbol: token.symbol },
                flowRate: pool.flowRate,
                flowSpitterId:
                  flowGuildConfig.flowSplitters[chainId]?.[token.symbol]?.id,
                totalAmountFlowedDistributedUntilUpdatedAt:
                  pool.totalAmountFlowedDistributedUntilUpdatedAt,
                totalAmountInstantlyDistributedUntilUpdatedAt:
                  pool.totalAmountInstantlyDistributedUntilUpdatedAt,
                updatedAtTimestamp: pool.updatedAtTimestamp,
                chainId,
                isMobile: isMobile || isTablet,
              },
            }
          : [],
        ...nodesFromPoolMembers,
      ].flat(),
      [
        ...edgesFromSafeDonors,
        ...edgesFromPoolDistributors,
        ...edgesFromPoolMembers,
      ].flat(),
    );

    return { nodes, edges };
  }, [
    pool,
    chainId,
    token,
    flowGuildConfig,
    ensByAddress,
    safeInflowRate,
    totalDonors,
    isMobile,
    isTablet,
    showProjectDetails,
  ]);

  return (
    <div
      style={{
        width: "100%",
        height: "50vh",
        margin: "auto",
        marginTop: 16,
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
