import { useMemo } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import InfoTooltip from "@/components/InfoTooltip";
import { Grantee } from "../types/grantee";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "../hooks/council";

type VoteBubbleProps = {
  grantees: Grantee[];
  granteeColors: Record<string, string>;
  votingPower: number;
  voteBubbleRef: React.MutableRefObject<HTMLDivElement | null>;
};

export default function VoteBubble(props: VoteBubbleProps) {
  const { grantees, granteeColors, votingPower, voteBubbleRef } = props;

  const { isMobile, isTablet } = useMediaQuery();
  const { newAllocation, council, dispatchNewAllocation } = useCouncil();

  const totalAllocatedProjects =
    newAllocation?.allocation.filter((allocation) => allocation.amount !== 0)
      .length ?? 0;
  const totalAllocatedVotes =
    newAllocation?.allocation
      ?.map((allocation) => allocation.amount)
      .reduce((a, b) => a + b, 0) ?? 0;

  const pieData = useMemo(() => {
    if (!grantees.length) {
      return [];
    }

    const allocatedVotes = newAllocation?.allocation
      ? newAllocation.allocation.reduce((sum, a) => sum + a.amount, 0)
      : 0;
    const unallocatedVotes = votingPower - allocatedVotes;
    const data = grantees.map((grantee) => {
      const allocation = newAllocation?.allocation?.find(
        (a) => a.grantee === grantee.address,
      );

      return {
        id: grantee.address,
        name: grantee.metadata.title,
        value: allocation ? allocation.amount : 0,
        color:
          allocation && allocation.amount > 0
            ? granteeColors[grantee.address]
            : "#e0e0e0",
      };
    });

    if (newAllocation?.allocation) {
      newAllocation.allocation.forEach((allocation) => {
        if (data.some((item) => item.id === allocation.grantee)) {
          return;
        }

        data.push({
          id: allocation.grantee,
          name: allocation.grantee.substring(0, 6),
          value: allocation.amount,
          color: granteeColors[allocation.grantee] || "#1f77b4",
        });
      });
    }

    if (unallocatedVotes > 0) {
      data.push({
        id: "0xdead",
        name: "Unallocated",
        value: unallocatedVotes,
        color: "#e0e0e0",
      });
    }

    return data.filter((entry) => entry.value > 0 || entry.id === "0xdead");
  }, [grantees, newAllocation?.allocation, granteeColors, votingPower]);

  const VoteButton = () => {
    return (
      <Button
        className="btn btn-primary d-flex align-items-center gap-2 py-3 px-4 shadow-lg rounded-pill"
        onClick={() => dispatchNewAllocation({ type: "show-ballot" })}
        style={{
          width: isMobile ? 360 : 400,
          transition: "all 0.2s ease-in-out",
          transform: "scale(1)",
          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 12px 20px rgba(0, 0, 0, 0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2)";
        }}
      >
        <Stack
          direction="horizontal"
          className="justify-content-center align-items-center bg-white rounded-circle"
          style={{ width: 64, height: 64, overflow: "hidden" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {pieData ? (
                <Pie data={pieData} dataKey="value" outerRadius={50}>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              ) : null}
            </PieChart>
          </ResponsiveContainer>
        </Stack>
        <Stack direction="vertical">
          <span className="fs-4 fw-semibold d-block text-center">VOTE</span>
          <small
            className={`fs-6 d-block ${totalAllocatedVotes > votingPower ? "text-warning" : "text-white-50"}`}
          >
            {totalAllocatedProjects}
            {council?.maxAllocationsPerMember
              ? `/${council.maxAllocationsPerMember}`
              : ""}{" "}
            Project{totalAllocatedProjects > 1 ? "s" : ""},{" "}
            {totalAllocatedVotes}/{votingPower} Vote
            {totalAllocatedVotes > 1 ? "s" : ""}
          </small>
        </Stack>
      </Button>
    );
  };

  return (
    <Stack
      ref={voteBubbleRef}
      direction="horizontal"
      className="position-fixed"
      style={{
        width: isMobile ? "100%" : "auto",
        justifyContent: isMobile ? "center" : "right",
        bottom: "2rem",
        right: isMobile ? "auto" : "2rem",
        zIndex: 3,
      }}
    >
      {isMobile || isTablet ? (
        <VoteButton />
      ) : (
        <InfoTooltip
          position={{ top: true }}
          content={<>Click to edit & submit your votes</>}
          target={<VoteButton />}
        />
      )}
    </Stack>
  );
}
