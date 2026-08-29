"use client";

import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";

const FLOW_STATE_X_URL = "https://x.com/flowstatecoop";

export default function SupRewardsCta() {
  const { isMobile } = useMediaQuery();

  const buttonClassName =
    "w-100 h-100 px-6 py-3 border-4 rounded-4 fs-lg fw-semi-bold";
  const linkStyle = { width: 280 };

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="align-items-center text-center border border-4 border-dark rounded-5 shadow bg-white px-4 py-8 px-lg-10"
    >
      <Image src="/sup.svg" alt="SUP" width={56} height={56} />
      <h3
        className={`m-0 fw-bold ${isMobile ? "fs-5" : "fs-4"}`}
        style={{ lineHeight: "120%" }}
      >
        Want to unlock $SUP rewards for you and your community of funders?
      </h3>
      <p className="m-0 fs-lg" style={{ maxWidth: 720 }}>
        Launch and fund a new Flow Council or automated Flow Splitter then DM us
        on X. Over 1.2M $SUP rewards are available for verified* funding rounds.
      </p>
      <Stack
        direction={isMobile ? "vertical" : "horizontal"}
        gap={3}
        className="justify-content-center align-items-center flex-wrap mt-2"
      >
        <Link href="/flow-councils/launch" style={linkStyle}>
          <Button className={buttonClassName}>Launch Flow Council</Button>
        </Link>
        <Link href="/flow-splitters/launch" style={linkStyle}>
          <Button className={buttonClassName}>Launch Flow Splitter</Button>
        </Link>
        <Link
          href={FLOW_STATE_X_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <Button variant="outline-dark" className={buttonClassName}>
            Get in Touch
          </Button>
        </Link>
      </Stack>
      <p className="m-0 fs-sm text-secondary" style={{ maxWidth: 720 }}>
        * $SUP-supported rounds are subject to Flow State&apos;s review: you
        must be running a genuine community funding round (i.e. no circular
        funding, sybils, etc.).
      </p>
    </Stack>
  );
}
