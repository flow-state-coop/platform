"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FLOW_STATE_MARKEE_ADDRESS,
  FLOW_STATE_MARKEE_URL,
  type MarkeeInfo,
} from "../lib/markee";

const REFRESH_MS = 60_000;

export default function MarkeeBanner({
  markee: initialMarkee,
}: {
  markee: MarkeeInfo | null;
}) {
  const [markee, setMarkee] = useState(initialMarkee);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const res = await fetch("/api/markee").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json().catch(() => null)) as {
        markee: MarkeeInfo | null;
      } | null;
      if (active && data?.markee) {
        setMarkee(data.markee);
      }
    };
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!markee) {
    return null;
  }

  return (
    <Link
      href={FLOW_STATE_MARKEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-decoration-none text-dark d-block"
      data-markee-address={FLOW_STATE_MARKEE_ADDRESS.toLowerCase()}
    >
      <div className="d-flex flex-column gap-1 border border-2 border-dark rounded-4 shadow-sm px-3 py-2 mb-4 cursor-pointer">
        <span className="fw-bold" style={{ fontSize: 13 }}>
          <span className="me-1" style={{ fontSize: 15 }}>
            📣
          </span>
          Flow State Markee
        </span>
        <span
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 14,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
            maxHeight: "6em",
          }}
        >
          {markee.message}
        </span>
        <div className="d-flex justify-content-between align-items-center gap-2 mt-1">
          <span className="text-secondary" style={{ fontSize: 12 }}>
            {markee.priceEth} ETH to change
          </span>
          <span className="bg-primary text-white fw-semi-bold rounded-pill px-3 py-1 text-nowrap flex-shrink-0">
            Change →
          </span>
        </div>
      </div>
    </Link>
  );
}
