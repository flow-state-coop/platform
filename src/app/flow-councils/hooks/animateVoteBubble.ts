import { useRef } from "react";

export default function useAnimateVoteBubble() {
  const voteBubbleRef = useRef<HTMLDivElement | null>(null);

  const animateVoteBubble = () => {
    if (!voteBubbleRef.current) {
      return;
    }

    const { current: voteBubble } = voteBubbleRef;

    voteBubble.animate(
      [
        { transform: "translateY(0%)" },
        { transform: "translateY(-20%)" },
        { transform: "translateY(0%)" },
        { transform: "translateY(-10%)" },
        { transform: "translateY(0%)" },
        { transform: "translateY(-5%)" },
        { transform: "translateY(0)" },
      ],
      {
        duration: 2000,
        iterations: 1,
      },
    );
  };

  return { voteBubbleRef, animateVoteBubble };
}
