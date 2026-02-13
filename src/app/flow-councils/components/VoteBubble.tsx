import { useMemo } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Grantee } from "../types/grantee";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowCouncil from "../hooks/flowCouncil";

type VoteBubbleProps = {
  grantees: Grantee[];
  granteeColors: Record<string, string>;
  votingPower: number;
  voteBubbleRef: React.MutableRefObject<HTMLDivElement | null>;
};

export default function VoteBubble(props: VoteBubbleProps) {
  const { grantees, granteeColors, votingPower, voteBubbleRef } = props;

  const { isMobile } = useMediaQuery();
  const { newBallot, council, dispatchShowBallot } = useFlowCouncil();

  const totalVotedProjects =
    newBallot?.votes.filter((v) => v.amount !== 0).length ?? 0;
  const totalVotes =
    newBallot?.votes?.map((v) => v.amount).reduce((a, b) => a + b, 0) ?? 0;

  const pieData = useMemo(() => {
    if (!grantees.length) {
      return [];
    }

    const usedVotes = newBallot?.votes
      ? newBallot.votes.reduce((sum, a) => sum + a.amount, 0)
      : 0;
    const remainingVotes = votingPower - usedVotes;
    const data = grantees.map((grantee) => {
      const granteeVote = newBallot?.votes?.find(
        (a) => a.recipient === grantee.address,
      );

      return {
        id: grantee.address,
        name: grantee.details.name ?? "",
        value: granteeVote ? granteeVote.amount : 0,
        color:
          granteeVote && granteeVote.amount > 0
            ? granteeColors[grantee.address]
            : "#e0e0e0",
      };
    });

    if (newBallot?.votes) {
      newBallot.votes.forEach((v) => {
        if (data.some((item) => item.id === v.recipient)) {
          return;
        }

        data.push({
          id: v.recipient,
          name: v.recipient.substring(0, 6),
          value: v.amount,
          color: granteeColors[v.recipient] || "#1f77b4",
        });
      });
    }

    if (remainingVotes > 0) {
      data.push({
        id: "0xdead",
        name: "Unallocated",
        value: remainingVotes,
        color: "#e0e0e0",
      });
    }

    return data.filter((entry) => entry.value > 0 || entry.id === "0xdead");
  }, [grantees, newBallot?.votes, granteeColors, votingPower]);

  const VoteButton = () => {
    return (
      <Button
        className="btn d-flex align-items-center gap-2 px-4 py-5 shadow-lg rounded-pill"
        onClick={() => dispatchShowBallot({ type: "show" })}
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
          <span className="fs-6 fw-semi-bold d-block text-center">VOTE</span>
          <span
            className={`fs-lg d-block ${totalVotes > votingPower ? "text-warning" : "text-white-50"}`}
          >
            {totalVotedProjects}
            {council?.maxVotingSpread ? `/${council.maxVotingSpread}` : ""}{" "}
            Project{totalVotedProjects > 1 ? "s" : ""}, {totalVotes}/
            {votingPower} Vote
            {totalVotes > 1 ? "s" : ""}
          </span>
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
      <VoteButton />
    </Stack>
  );
}
