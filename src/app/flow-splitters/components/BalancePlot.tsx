import { useEffect, useRef } from "react";
import { formatEther } from "viem";
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

export type BalancePlotFlowInfo = {
  currentStartingBalance: bigint;
  newStartingBalance: bigint;
  currentTotalFlowRate: bigint;
  currentLiquidation: number | null;
  newTotalFlowRate: bigint;
  newLiquidation: number | null;
};

type BalancePlotProps = {
  flowInfo: BalancePlotFlowInfo | null;
};

const MS_IN_SEC = 1000;
const SECONDS_IN_YEAR = 31536000;

export default function BalancePlot(props: BalancePlotProps) {
  const { flowInfo } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentMonthlyFlow = Number(
    formatEther(
      !flowInfo
        ? BigInt(0)
        : (flowInfo.currentTotalFlowRate < 0
            ? -flowInfo.currentTotalFlowRate
            : flowInfo.currentTotalFlowRate) * BigInt(SECONDS_IN_MONTH),
    ),
  );
  const newMonthlyFlow = Number(
    formatEther(
      !flowInfo
        ? BigInt(0)
        : (flowInfo.newTotalFlowRate < 0
            ? -flowInfo.newTotalFlowRate
            : flowInfo.newTotalFlowRate) * BigInt(SECONDS_IN_MONTH),
    ),
  );

  useEffect(() => {
    if (!flowInfo || !containerRef.current) {
      return;
    }

    const currentStartingBalance = Number(
      formatEther(flowInfo.currentStartingBalance),
    );
    const newStartingBalance = Number(formatEther(flowInfo.newStartingBalance));
    const now = (Date.now() / MS_IN_SEC) | 0;
    const currentEndingBalance =
      flowInfo.currentTotalFlowRate > 0
        ? Number(
            formatEther(
              flowInfo.currentStartingBalance +
                flowInfo.currentTotalFlowRate * BigInt(SECONDS_IN_YEAR),
            ),
          )
        : !flowInfo.currentLiquidation ||
            flowInfo.currentLiquidation > now + SECONDS_IN_YEAR
          ? Number(
              formatEther(
                flowInfo.currentStartingBalance +
                  flowInfo.currentTotalFlowRate * BigInt(SECONDS_IN_YEAR),
              ),
            )
          : 0;
    const newEndingBalance =
      flowInfo.newTotalFlowRate > 0
        ? Number(
            formatEther(
              flowInfo.newStartingBalance +
                flowInfo.newTotalFlowRate * BigInt(SECONDS_IN_YEAR),
            ),
          )
        : !flowInfo.newLiquidation ||
            flowInfo.newLiquidation > now + SECONDS_IN_YEAR
          ? Number(
              formatEther(
                flowInfo.newStartingBalance +
                  flowInfo.newTotalFlowRate * BigInt(SECONDS_IN_YEAR),
              ),
            )
          : 0;
    const currentEndingDate =
      flowInfo.currentTotalFlowRate > 0
        ? new Date((now + SECONDS_IN_YEAR) * MS_IN_SEC)
        : !flowInfo.currentLiquidation ||
            flowInfo.currentLiquidation > now + SECONDS_IN_YEAR
          ? new Date((now + SECONDS_IN_YEAR) * MS_IN_SEC)
          : new Date(flowInfo.currentLiquidation * MS_IN_SEC);
    const newEndingDate =
      flowInfo.newTotalFlowRate > 0 && !flowInfo.newLiquidation
        ? new Date((now + SECONDS_IN_YEAR) * MS_IN_SEC)
        : !flowInfo.newLiquidation ||
            flowInfo.newLiquidation > now + SECONDS_IN_YEAR
          ? new Date((now + SECONDS_IN_YEAR) * MS_IN_SEC)
          : new Date(flowInfo.newLiquidation! * MS_IN_SEC);

    const plot = Plot.plot({
      marks: [
        Plot.frame({ anchor: "bottom" }),
        Plot.frame({ anchor: "left" }),
        flowInfo.currentTotalFlowRate === BigInt(0)
          ? []
          : Plot.line(
              [
                [new Date(), currentStartingBalance],
                [currentEndingDate, currentEndingBalance],
              ],
              { stroke: "#6c757d", strokeWidth: 3 },
            ),
        flowInfo.currentTotalFlowRate === flowInfo.newTotalFlowRate
          ? []
          : Plot.line(
              [
                [new Date(), newStartingBalance],
                [newEndingDate, newEndingBalance],
              ],
              { stroke: "#247789", strokeWidth: 3 },
            ),
        Plot.axisX({
          anchor: "bottom",
          label: "Today",
          labelAnchor: "left",
          ticks: 4,
        }),
        Plot.ruleY(
          [
            currentEndingBalance < newEndingBalance && currentEndingBalance > 0
              ? currentEndingBalance - currentEndingBalance * 0.1
              : newEndingBalance > 0
                ? newEndingBalance - newEndingBalance * 0.1
                : 0,
          ],
          {
            stroke: "transparent",
          },
        ),
        Plot.ruleY(
          [
            currentStartingBalance > newStartingBalance
              ? currentStartingBalance + currentStartingBalance * 0.1
              : newStartingBalance + newStartingBalance * 0.1,
          ],
          {
            stroke: "transparent",
          },
        ),
        Plot.ruleX(
          [
            currentEndingDate > newEndingDate
              ? new Date(
                  currentEndingDate.getTime() +
                    (currentEndingDate.getTime() - now * MS_IN_SEC) * 0.1,
                )
              : new Date(
                  newEndingDate.getTime() +
                    (newEndingDate.getTime() - now * MS_IN_SEC) * 0.1,
                ),
          ],
          {
            stroke: "transparent",
          },
        ),
      ],
      y: {
        ticks: 4,
        tickFormat: (x) => {
          if (x > 1e3) {
            return d3.format(".2s")(x);
          }

          return x;
        },
      },
    });

    containerRef.current.append(plot);

    return () => plot.remove();
  }, [flowInfo]);

  return (
    <div className="p-3 bg-white rounded-4">
      {flowInfo && (
        <p className="w-100 mb-1 fw-semi-bold text-center text-info">
          Now ={" "}
          {formatNumber(Number(formatEther(flowInfo.currentStartingBalance)))}{" "}
          {flowInfo.currentTotalFlowRate > 0 ? "+" : "-"}{" "}
          {formatNumber(currentMonthlyFlow)}
          /mo
        </p>
      )}
      {flowInfo &&
        flowInfo.currentTotalFlowRate !== flowInfo.newTotalFlowRate && (
          <p className="w-100 mb-2 fw-semi-bold text-center text-primary">
            New ={" "}
            {formatNumber(Number(formatEther(flowInfo.newStartingBalance)))}{" "}
            {flowInfo.newTotalFlowRate > 0 ? "+" : "-"}{" "}
            {formatNumber(newMonthlyFlow)}
            /mo
          </p>
        )}
      <div className="w-100 h-100" ref={containerRef} />
    </div>
  );
}
