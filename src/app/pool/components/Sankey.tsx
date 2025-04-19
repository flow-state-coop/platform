import {
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import * as d3 from "d3";
import * as d3Sankey from "d3-sankey";
import { Address, formatEther } from "viem";
import { useReadContracts } from "wagmi";
import Form from "react-bootstrap/Form";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Grantee } from "../pool";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type SankeyProps = {
  grantees: Grantee[];
  chainId: number;
  gdaPoolAddress: Address;
  totalDistributionsCount: number;
};

type CustomNodeProperties = {
  id: string;
  name: string;
  color: string;
};
type CustomLinkProperties = {
  uid: string;
  dotSize: number;
  dotColor: d3.ScaleLinear<number, number, string>;
};
type SankeyNode = d3Sankey.SankeyNode<
  CustomNodeProperties,
  CustomLinkProperties
>;
type SankeyLink = d3Sankey.SankeyLink<
  CustomNodeProperties,
  CustomLinkProperties
>;

type Dataset = {
  nodes: { id: string; name: string }[];
  links: { source: number; target: number; value: number }[];
};

enum Mode {
  LIVE = "Live",
  TOTAL = "Total",
}

const FPS = 60;
const ANIMATION_DURATION = 4000;
const dots: {
  link: SankeyLink;
  time: number;
  yJitter: number;
  path: SVGPathElement;
}[] = [];

export default function Sankey(props: SankeyProps) {
  const { grantees, chainId, gdaPoolAddress, totalDistributionsCount } = props;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<Mode>(Mode.LIVE);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const svgGroup = useRef<SVGGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerDots = useRef<d3.Timer | null>(null);
  const timerLabels = useRef<d3.Timer | null>(null);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const totalMatchings = useReadContracts({
    contracts: grantees.map((grantee) => {
      return {
        chainId,
        address: gdaPoolAddress,
        abi: superfluidPoolAbi,
        functionName: "getTotalAmountReceivedByMember",
        args: [grantee.recipientAddress as Address],
        query: { enabled: gdaPoolAddress !== "0x" },
      };
    }),
  });

  const svgTargetWidth = isMobile
    ? 500
    : isTablet || isSmallScreen
      ? 1000
      : isMediumScreen
        ? 1300
        : 1600;
  const svgTargetHeight =
    grantees.length < 16
      ? 720
      : grantees.length < 32
        ? 1440
        : grantees.length < 64
          ? 2880
          : grantees.length < 128
            ? 5760
            : 11520;
  const allocationToken = grantees[0]?.allocationTokenInfo.symbol;
  const matchingToken = grantees[0]?.matchingTokenInfo.symbol;
  const totalDonationsCount =
    grantees.length > 0
      ? grantees
          .map((grantee) => grantee.inflow.activeIncomingStreamCount)
          .reduce((a, b) => a + b)
      : 0;

  useLayoutEffect(() => {
    if (!svgRef.current || !dataset) {
      return;
    }

    const nodePadding = isMobile ? 15 : 25;
    const linkHorizontal = d3Sankey.sankeyLinkHorizontal();
    const svg = d3.select(svgRef.current);
    const sankey = d3Sankey
      .sankey()
      .nodeWidth(15)
      .nodePadding(nodePadding)
      .extent([
        [1, 5],
        [svgTargetWidth, svgTargetHeight - nodePadding],
      ])
      .nodeSort((a, b) => Number(b.value) - Number(a.value));

    const { nodes, links } = sankey({
      nodes: dataset.nodes.map((d) => Object.assign({}, d)) as SankeyNode[],
      links: dataset.links.map((d) => Object.assign({}, d)) as SankeyLink[],
    }) as {
      nodes: SankeyNode[];
      links: SankeyLink[];
    };

    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const linkExtent = d3.extent(links, (d) => d.value);
    const dotSize = d3
      .scaleLinear()
      .domain(linkExtent as [number, number])
      .range([isMobile ? 2 : 3, isMobile ? 4 : 6]);

    if (svgGroup?.current) {
      svgGroup.current.remove();
    }

    const bounds = svg.append("g");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svgGroup.current = bounds as any;

    bounds
      .append("g")
      .attr("stroke", "#000")
      .selectAll()
      .data(nodes)
      .join("rect")
      .attr("x", (d: { x0?: number }) => {
        return d.x0 ?? 0;
      })
      .attr("y", (d) => d.y0 ?? 0)
      .attr("height", (d) => (d.y1 ?? 0) - (d.y0 ?? 0))
      .attr("width", (d) => (d.x1 ?? 0) - (d.x0 ?? 0))
      .attr("fill", (d) => {
        return (d.color = color(d.id));
      })

      .attr("stroke", "none");

    const link = bounds
      .append("g")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.2)
      .selectAll()
      .data(links)
      .join("g")
      .style("mix-blend-mode", "multiply");

    const gradient = link
      .append("linearGradient")
      .attr("id", (d, i) => (d.uid = `link-${i}`))
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", (d) => (d.source as SankeyNode).x1 ?? 0)
      .attr("x2", (d) => (d.target as SankeyNode).x0 ?? 0);
    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", (d) => color((d.source as SankeyNode).id));
    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", (d) => color((d.target as SankeyNode).id));

    link
      .append("path")
      .attr("d", linkHorizontal)
      .attr("stroke", (d) => `url(#${d.uid})`)
      .attr("stroke-width", (d) => Math.max(1, d.width ?? 0));

    bounds
      .append("g")
      .selectAll()
      .data(nodes)
      .join("text")
      .attr("class", "label")
      .attr("x", (d) => (d.x0! < svgTargetWidth / 2 ? d.x1! + 6 : d.x0! - 6))
      .attr("y", (d) => (d.y0 && d.y1 ? (d.y1 + d.y0) / 2 : 0))
      .attr("dy", isMobile ? "0.3rem" : "0.6rem")
      .attr("font-size", isMobile ? "1.2rem" : "1.4rem")
      .attr("text-anchor", (d) =>
        d.x0 && d.x0 < svgTargetWidth / 2 ? "start" : "end",
      )
      .attr("fill", (d) => (d.value ? color(d.id) : "none"))
      .text(
        (d) =>
          `${d.name.length > 50 ? d.name.slice(0, 50) + "..." : d.name} ${Intl.NumberFormat(
            "en",
            {
              maximumFractionDigits: 4,
            },
          ).format(d.value ?? 0)}${
            d.id === "Matching"
              ? " " + matchingToken + " " + "(" + totalDistributionsCount + ")"
              : d.id === "Direct"
                ? " " + allocationToken + " " + "(" + totalDonationsCount + ")"
                : ""
          }`,
      );

    bounds
      .append("g")
      .selectAll(".link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", linkHorizontal)
      .attr("fill", "none");

    links.forEach((link) => {
      link.dotSize = dotSize(link.value);
      link.dotColor = d3
        .scaleLinear()
        .domain([1, ANIMATION_DURATION])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .range([(link.source as any).color, (link.target as any).color]);
    });
  }, [
    dataset,
    svgTargetWidth,
    svgTargetHeight,
    isMobile,
    allocationToken,
    matchingToken,
    totalDonationsCount,
    totalDistributionsCount,
  ]);

  useLayoutEffect(() => {
    if (!svgRef?.current) {
      return;
    }

    const svgBoundingRect = svgRef.current.getBoundingClientRect();

    if (
      svgBoundingRect &&
      svgBoundingRect.width > 0 &&
      svgBoundingRect.height > 0
    ) {
      setDimensions({
        width: svgBoundingRect.width,
        height: svgBoundingRect.height,
      });
    }
  }, [
    windowDimensions,
    isMobile,
    isTablet,
    isSmallScreen,
    isMediumScreen,
    isBigScreen,
  ]);

  useEffect(() => {
    if (grantees.length === 0) {
      return;
    }

    const hasUserOutflow = !!grantees.find(
      (grantee) =>
        grantee.userOutflow && BigInt(grantee.userOutflow.currentFlowRate) > 0,
    );

    const dataset: Dataset = {
      nodes: [
        { id: "Direct", name: "Direct" },
        { id: "Matching", name: "Matching" },
      ]
        .concat(hasUserOutflow ? [{ id: "You", name: "You" }] : [])
        .concat(
          grantees.map((grantee) => {
            return { id: grantee.id, name: grantee.metadata.title };
          }),
        ),
      links: [],
    };

    for (const i in grantees) {
      if (
        mode === Mode.TOTAL ||
        BigInt(grantees[i].inflow.totalInflowRate) > 0
      ) {
        dataset.links.push({
          source: 0,
          target: dataset.nodes.findIndex((node) => grantees[i].id === node.id),
          value: Number(
            formatEther(
              mode === Mode.TOTAL
                ? BigInt(
                    grantees[i].inflow.totalAmountStreamedInUntilUpdatedAt,
                  ) -
                    BigInt(grantees[i].userOutflow?.streamedUntilUpdatedAt ?? 0)
                : BigInt(grantees[i].inflow.totalInflowRate) *
                    BigInt(SECONDS_IN_MONTH) -
                    BigInt(grantees[i].userOutflow?.currentFlowRate ?? 0) *
                      BigInt(SECONDS_IN_MONTH),
            ),
          ),
        });
      }

      if (mode === Mode.TOTAL || BigInt(grantees[i].matchingFlowRate) > 0) {
        dataset.links.push({
          source: 1,
          target: dataset.nodes.findIndex((node) => grantees[i].id === node.id),
          value: Number(
            formatEther(
              mode === Mode.TOTAL && totalMatchings?.data
                ? (totalMatchings.data[i].result as bigint)
                : BigInt(grantees[i].matchingFlowRate) *
                    BigInt(SECONDS_IN_MONTH),
            ),
          ),
        });
      }

      if (grantees[i].userOutflow) {
        dataset.links.push({
          source: 2,
          target: dataset.nodes.findIndex((node) => grantees[i].id === node.id),
          value: Number(
            formatEther(
              mode === Mode.TOTAL
                ? BigInt(grantees[i].userOutflow.streamedUntilUpdatedAt)
                : BigInt(grantees[i].userOutflow.currentFlowRate) *
                    BigInt(SECONDS_IN_MONTH),
            ),
          ),
        });
      }
    }

    setDataset({
      nodes: dataset.nodes,
      links: dataset.links.filter((link) => link.value > 0),
    });
  }, [grantees, mode, totalMatchings?.data]);

  const drawDot = useCallback(
    (point: { x: number; y: number }, size: number, color: string) => {
      if (!canvasRef?.current) {
        return;
      }

      const ctx = canvasRef.current.getContext("2d");

      if (ctx) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = color;
        ctx.strokeStyle = "transparent";
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    },
    [canvasRef],
  );

  const animate = useCallback(
    (elapsed: number) => {
      if (!canvasRef?.current) {
        return;
      }

      const removeItemsFrom = dots.findIndex(
        (dot) => dot.time > elapsed - ANIMATION_DURATION,
      );

      if (removeItemsFrom > -1) {
        dots.splice(0, removeItemsFrom);
      }

      const nodes = d3.selectAll(".link").nodes();

      d3.selectAll(".link").each((d, i) => {
        const yJitter =
          (Math.random() - 0.5) * (((d as SankeyLink)?.width ?? 0) * 0.9);

        dots.push({
          link: d as SankeyLink,
          time: elapsed,
          yJitter,
          path: nodes[i] as SVGPathElement,
        });
      });

      const ctx = canvasRef.current.getContext("2d");

      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        for (const dot of dots) {
          const currentTime = elapsed - dot.time;
          const currentPercent =
            (currentTime / ANIMATION_DURATION) * dot.path.getTotalLength();
          const currentPos = dot.path.getPointAtLength(currentPercent);
          const scalingXFactor = svgTargetWidth / dimensions.width;
          const scalingYFactor = svgTargetHeight / dimensions.height;

          drawDot(
            {
              x: currentPos.x / scalingXFactor,
              y: (currentPos.y + dot.yJitter) / scalingYFactor,
            },
            dot.link.dotSize,
            dot.link.dotColor(currentTime) as string,
          );
        }
      }
    },
    [dimensions, drawDot, svgTargetHeight, svgTargetWidth],
  );

  useEffect(() => {
    const svgBoundingRect = svgRef.current?.getBoundingClientRect();

    if (
      !svgBoundingRect ||
      dimensions.width !== svgBoundingRect.width ||
      dimensions.height !== svgBoundingRect.height
    ) {
      return;
    }

    timerDots.current = d3.interval((elapsed) => animate(elapsed), 1000 / FPS);

    return () => {
      if (timerDots?.current) {
        timerDots.current.stop();
      }
    };
  }, [dimensions, drawDot, animate]);

  useEffect(() => {
    if (timerLabels?.current) {
      timerLabels.current.stop();
    }

    if (mode !== Mode.TOTAL || !totalMatchings?.data) {
      return;
    }

    const updatedLabels = () => {
      d3.selectAll(".label").text((d) => {
        if ((d as SankeyNode).id === "Matching") {
          const totalMatching = totalMatchings.data
            .map((d) => d.result as bigint)
            .reduce((a, b) => a + b, BigInt(0));
          const totalMatchingFlowRate = grantees
            .map((d) => BigInt(d.matchingFlowRate))
            .reduce((a, b) => a + b, BigInt(0));
          const elapsedTimeInMillisecondsMatching = BigInt(
            Date.now() - totalMatchings.dataUpdatedAt,
          );
          const flowingAmountMatching =
            totalMatching +
            (totalMatchingFlowRate * elapsedTimeInMillisecondsMatching) /
              BigInt(1000);

          return `${(d as SankeyNode).name} ${Intl.NumberFormat("en", {
            maximumFractionDigits: 4,
          }).format(
            Number(formatEther(flowingAmountMatching)),
          )} ${matchingToken} (${totalDistributionsCount})`;
        }

        if ((d as SankeyNode).id === "Direct") {
          const flowingAmountDirect = grantees
            .map((d) => {
              const elapsedTimeInMillisecondsDirect = BigInt(
                Date.now() - d.inflow.updatedAtTimestamp * 1000,
              );
              const elapsedTimeInMillisecondsUser = d.userOutflow
                ? BigInt(Date.now() - d.userOutflow.updatedAtTimestamp * 1000)
                : BigInt(0);
              const totalDirect =
                BigInt(d.inflow.totalAmountStreamedInUntilUpdatedAt) +
                (BigInt(d.inflow.totalInflowRate) *
                  elapsedTimeInMillisecondsDirect) /
                  BigInt(1000);
              const totalUser = d.userOutflow
                ? BigInt(d.userOutflow.streamedUntilUpdatedAt) +
                  (BigInt(d.userOutflow.currentFlowRate) *
                    elapsedTimeInMillisecondsUser) /
                    BigInt(1000)
                : BigInt(0);

              return totalDirect - totalUser;
            })
            .reduce((a, b) => a + b, BigInt(0));

          return `${(d as SankeyNode).name} ${Intl.NumberFormat("en", {
            maximumFractionDigits: 4,
          }).format(
            Number(formatEther(flowingAmountDirect)),
          )} ${allocationToken} (${totalDonationsCount})`;
        }

        if ((d as SankeyNode).id === "You") {
          const flowingAmountUser = grantees
            .map((d) => {
              const elapsedTimeInMilliseconds = d.userOutflow
                ? BigInt(Date.now() - d.userOutflow.updatedAtTimestamp * 1000)
                : BigInt(0);

              return d.userOutflow
                ? BigInt(d.userOutflow.streamedUntilUpdatedAt) +
                    (BigInt(d.userOutflow.currentFlowRate) *
                      elapsedTimeInMilliseconds) /
                      BigInt(1000)
                : BigInt(0);
            })
            .reduce((a, b) => a + b, BigInt(0));

          return `${(d as SankeyNode).name} ${Intl.NumberFormat("en", {
            maximumFractionDigits: 4,
          }).format(Number(formatEther(flowingAmountUser)))}`;
        }

        const granteeIndex = grantees.findIndex(
          (grantee) => grantee.id === (d as SankeyNode).id,
        );
        if (granteeIndex > -1) {
          const elapsedTimeInMillisecondsMatching = BigInt(
            Date.now() - totalMatchings.dataUpdatedAt,
          );
          const flowingAmountMatching =
            (totalMatchings.data[granteeIndex].result as bigint) +
            (BigInt(grantees[granteeIndex].matchingFlowRate) *
              elapsedTimeInMillisecondsMatching) /
              BigInt(1000);
          const elapsedTimeInMillisecondsDirect = BigInt(
            Date.now() -
              grantees[granteeIndex].inflow.updatedAtTimestamp * 1000,
          );
          const flowingAmountDirect =
            BigInt(
              grantees[granteeIndex].inflow.totalAmountStreamedInUntilUpdatedAt,
            ) +
            (BigInt(grantees[granteeIndex].inflow.totalInflowRate) *
              elapsedTimeInMillisecondsDirect) /
              BigInt(1000);

          return `${(d as SankeyNode).name} ${Intl.NumberFormat("en", {
            maximumFractionDigits: 4,
          }).format(
            Number(formatEther(flowingAmountMatching + flowingAmountDirect)),
          )}`;
        }

        return `${(d as SankeyNode).name} ${Intl.NumberFormat("en", {
          maximumFractionDigits: 4,
        }).format((d as SankeyNode).value ?? 0)}`;
      });
    };

    timerLabels.current = d3.interval(updatedLabels, 100);

    return () => {
      if (timerLabels?.current) {
        timerLabels.current.stop();
      }
    };
  }, [
    mode,
    grantees,
    totalMatchings?.data,
    totalMatchings?.dataUpdatedAt,
    allocationToken,
    matchingToken,
    totalDonationsCount,
    totalDistributionsCount,
  ]);

  useEffect(() => {
    if (!window.visualViewport) {
      return;
    }

    let timerId: NodeJS.Timer;

    const handleResize = () => {
      if (window.innerWidth === windowDimensions.width) {
        return;
      }

      clearTimeout(Number(timerId));

      dots.splice(0, dots.length);
      timerDots.current?.stop();
      timerLabels.current?.stop();

      timerId = setTimeout(
        () =>
          setWindowDimensions({
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        150,
      );
    };

    window.visualViewport.addEventListener("resize", handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }

      dots.splice(0, dots.length);
    };
  }, [windowDimensions.width]);

  return (
    <div>
      {dataset && (
        <Form className="d-flex justify-content-end gap-2 fs-4">
          <Form.Label className="cursor-pointer">{Mode.LIVE}</Form.Label>
          <Form.Switch
            defaultChecked={false}
            className="d-flex justify-content-center"
            onChange={() => {
              dots.splice(0, dots.length);
              timerDots.current?.stop();
              timerDots.current = d3.interval(
                (elapsed) => animate(elapsed),
                1000 / FPS,
              );
              setMode(mode === Mode.LIVE ? Mode.TOTAL : Mode.LIVE);
            }}
          />
          <Form.Label className="cursor-pointer">{Mode.TOTAL}</Form.Label>
        </Form>
      )}
      <div className="d-flex flex-column align-items-center">
        <div className="position-relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgTargetWidth} ${svgTargetHeight}`}
            width={svgTargetWidth}
            height={svgTargetHeight}
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className="position-absolute start-0"
          />
        </div>
      </div>
    </div>
  );
}
