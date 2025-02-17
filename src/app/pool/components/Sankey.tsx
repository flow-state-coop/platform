import {
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import * as d3 from "d3";
import * as d3Sankey from "d3-sankey";
import { formatEther } from "viem";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Grantee } from "../pool";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type SankeyProps = {
  grantees: Grantee[];
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

const FPS = 60;
const ANIMATION_DURATION = 2000;
const dots: {
  link: SankeyLink;
  time: number;
  yJitter: number;
  path: SVGPathElement;
}[] = [];

export default function Sankey(props: SankeyProps) {
  const { grantees } = props;

  const [dataset, setDataset] = useState<Dataset | null>(null);

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
  const timer = useRef<d3.Timer | null>(null);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();

  const svgTargetWidth = isMobile ? 400 : 1920;
  const svgTargetHeight = isMobile ? 900 : 1080;

  useLayoutEffect(() => {
    if (!svgRef.current || !dataset) {
      return;
    }

    const linkHorizontal = d3Sankey.sankeyLinkHorizontal();
    const svg = d3.select(svgRef.current);
    const sankey = d3Sankey
      .sankey()
      .nodeWidth(15)
      .nodePadding(18)
      .extent([
        [1, 5],
        [svgTargetWidth, svgTargetHeight],
      ]);

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
      .range([isMobile ? 2 : 4, isMobile ? 4 : 8]);

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
      .attr("stroke-opacity", 0.5)
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
      .attr("x", (d) => (d.x0! < svgTargetWidth / 2 ? d.x1! + 6 : d.x0! - 6))
      .attr("y", (d) => (d.y0 && d.y1 ? (d.y1 + d.y0) / 2 : 0))
      .attr("dy", (d) =>
        Math.round(d?.y1 ?? 0) === svgTargetHeight &&
        d.y0 &&
        d.y1 &&
        d.y1 - d.y0 < 20
          ? "0"
          : isMobile
            ? "0.3rem"
            : "0.7rem",
      )
      .attr("font-size", isMobile ? "1rem" : "1.4rem")
      .attr("text-anchor", (d) =>
        d.x0 && d.x0 < svgTargetWidth / 2 ? "start" : "end",
      )
      .attr("fill", (d) => (d.value ? color(d.id) : "none"))
      .text(
        (d) =>
          `${d.name} ${Intl.NumberFormat("en", {
            maximumFractionDigits: 4,
          }).format(d.value ?? 0)}`,
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
        .domain([1, svgTargetWidth])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .range([(link.source as any).color, (link.target as any).color]);
    });
  }, [dataset, svgTargetWidth, svgTargetHeight, isMobile]);

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

  const drawDot = useCallback(
    (point: { x: number; y: number }, size: number, color: string) => {
      if (!canvasRef?.current) {
        return;
      }

      const ctx = canvasRef.current.getContext("2d");

      if (ctx) {
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

  useEffect(() => {
    const svgBoundingRect = svgRef.current?.getBoundingClientRect();

    if (
      !svgBoundingRect ||
      dimensions.width !== svgBoundingRect.width ||
      dimensions.height !== svgBoundingRect.height
    ) {
      return;
    }

    const animate = (elapsed: number) => {
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
    };

    timer.current = d3.interval((elapsed) => animate(elapsed), 1000 / FPS);

    return () => {
      if (timer?.current) {
        timer.current.stop();
      }
    };
  }, [timer, dimensions, svgTargetWidth, svgTargetHeight, drawDot]);

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

    for (const grantee of grantees) {
      if (BigInt(grantee.inflow.totalInflowRate) > 0) {
        dataset.links.push({
          source: 0,
          target: dataset.nodes.findIndex((node) => grantee.id === node.id),
          value: Number(
            formatEther(
              BigInt(grantee.inflow.totalInflowRate) *
                BigInt(SECONDS_IN_MONTH) -
                BigInt(grantee.userOutflow?.currentFlowRate ?? 0) *
                  BigInt(SECONDS_IN_MONTH),
            ),
          ),
        });
      }

      if (BigInt(grantee.matchingFlowRate) > 0) {
        dataset.links.push({
          source: 1,
          target: dataset.nodes.findIndex((node) => grantee.id === node.id),
          value: Number(
            formatEther(
              BigInt(grantee.matchingFlowRate) * BigInt(SECONDS_IN_MONTH),
            ),
          ),
        });
      }

      if (grantee.userOutflow) {
        dataset.links.push({
          source: 2,
          target: dataset.nodes.findIndex((node) => grantee.id === node.id),
          value: Number(
            formatEther(
              BigInt(grantee.userOutflow.currentFlowRate) *
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
  }, [grantees]);

  useEffect(() => {
    if (!window.visualViewport) {
      return;
    }

    let timerId: NodeJS.Timer;

    const handleResize = () => {
      clearTimeout(Number(timerId));

      dots.splice(0, dots.length);
      timer.current?.stop();

      timerId = setTimeout(
        () =>
          setWindowDimensions({
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        250,
      );
    };

    window.visualViewport.addEventListener("resize", handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  return (
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
  );
}
