"use client";

import Container from "react-bootstrap/Container";
import RoundCard from "./components/RoundCard";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Explore() {
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();

  return (
    <Container
      className="mx-auto px-4 mb-5"
      style={{
        maxWidth:
          isMobile || isTablet
            ? "100%"
            : isSmallScreen
              ? 1000
              : isMediumScreen
                ? 1300
                : 1600,
      }}
    >
      <h1 className="mt-5">Explore</h1>
      <h2 className="fs-4 mb-4">Active streaming funding campaigns</h2>
      <div
        className="pb-5"
        style={{
          display: "grid",
          columnGap: "1.5rem",
          rowGap: "3rem",
          gridTemplateColumns: isTablet
            ? "repeat(1,minmax(0,1fr))"
            : isSmallScreen
              ? "repeat(2,minmax(0,1fr))"
              : isMediumScreen || isBigScreen
                ? "repeat(3,minmax(0,1fr))"
                : "",
        }}
      >
        <RoundCard
          name="Flow State"
          image="/logo-circle.svg"
          roundType="Flow Guild"
          totalFunding="5.36"
          tokenSymbol="ETHx"
          link="/core"
        />
        <RoundCard
          name="Octant Builder Accellerator"
          image="/octant.svg"
          roundType="Streaming Quadratic Funding"
          totalFunding="28.13"
          tokenSymbol="ETHx"
          link="/octant"
        />
        <RoundCard
          name="GoodBuilders Program"
          image="/good-dollar.webp"
          roundType="Flow Council"
          link="https://gooddollar.notion.site/GoodBuilders-Program-1a6f258232f080fea8a6e3760bb8f53d"
        />
        <RoundCard
          name="Guild Guild"
          image="/guild-guild.svg"
          roundType="Flow Guild"
          link="https://guildguild.xyz"
        />
        <RoundCard
          name="Greenpill Dev Guild"
          image="/greenpill.svg"
          roundType="Flow Guild"
          link="https://app.charmverse.io/greenpill-dev-guild/"
        />
      </div>
    </Container>
  );
}
