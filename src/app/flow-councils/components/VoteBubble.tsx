import { useMemo } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Recipient } from "../types/recipient";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowCouncil from "../hooks/flowCouncil";

type VoteBubbleProps = {
  recipients: Recipient[];
  recipientColors: Record<string, string>;
  votingPower: number;
  voteBubbleRef: React.MutableRefObject<HTMLDivElement | null>;
};

export default function VoteBubble(props: VoteBubbleProps) {
  const { recipients, recipientColors, votingPower, voteBubbleRef } = props;

  const { isMobile } = useMediaQuery();
  const { newBallot, flowCouncil, dispatchShowBallot } = useFlowCouncil();

  const totalAllocatedProjects =
    newBallot?.ballot.filter((ballot) => ballot.amount !== 0).length ?? 0;
  const totalAllocatedVotes =
    newBallot?.ballot
      ?.map((ballot) => ballot.amount)
      .reduce((a, b) => a + b, 0) ?? 0;

  const pieData = useMemo(() => {
    if (!recipients.length) {
      return [];
    }

    const allocatedVotes = newBallot?.ballot
      ? newBallot.ballot.reduce((sum, a) => sum + a.amount, 0)
      : 0;
    const unallocatedVotes = votingPower - allocatedVotes;
    const data = recipients.map((recipient) => {
      const ballot = newBallot?.ballot?.find(
        (a) => a.recipient === recipient.address,
      );

      return {
        id: recipient.address,
        name: recipient.metadata.title,
        value: ballot ? ballot.amount : 0,
        color:
          ballot && ballot.amount > 0
            ? recipientColors[recipient.address]
            : "#e0e0e0",
      };
    });

    if (newBallot?.ballot) {
      newBallot.ballot.forEach((ballot) => {
        if (data.some((item) => item.id === ballot.recipient)) {
          return;
        }

        data.push({
          id: ballot.recipient,
          name: ballot.recipient.substring(0, 6),
          value: ballot.amount,
          color: recipientColors[ballot.recipient] || "#1f77b4",
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
  }, [recipients, newBallot?.ballot, recipientColors, votingPower]);

  const VoteButton = () => {
    return (
      <Button
        className="btn btn-primary d-flex align-items-center gap-2 py-3 px-4 shadow-lg rounded-pill"
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
          <span className="fs-4 fw-semibold d-block text-center">VOTE</span>
          <small
            className={`fs-6 d-block ${totalAllocatedVotes > votingPower ? "text-warning" : "text-white-50"}`}
          >
            {totalAllocatedProjects}
            {flowCouncil?.maxAllocationsPerMember
              ? `/${flowCouncil.maxAllocationsPerMember}`
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
      <VoteButton />
    </Stack>
  );
}
