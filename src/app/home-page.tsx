"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import { useMediaQuery } from "@/hooks/mediaQuery";

enum TargetAudience {
  FUNDERS = "For funders",
  BUILDERS = "For builders",
  EVERYONE = "For everyone",
}

export default function HomePage() {
  const [showTargetAudience, setShowTargetAudience] = useState<TargetAudience>(
    TargetAudience.FUNDERS,
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile, isTablet, isSmallScreen, isBigScreen } = useMediaQuery();
  const postHog = usePostHog();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  useEffect(() => {
    const targetAudienceElem = document.getElementById("target-audience");

    if (searchParams.get("for-funders")) {
      setShowTargetAudience(TargetAudience.FUNDERS);
      targetAudienceElem?.scrollIntoView();
    } else if (searchParams.get("for-builders")) {
      setShowTargetAudience(TargetAudience.BUILDERS);
      targetAudienceElem?.scrollIntoView();
    } else if (searchParams.get("for-everyone")) {
      setShowTargetAudience(TargetAudience.EVERYONE);
      targetAudienceElem?.scrollIntoView();
    }
  }, [router, searchParams]);

  return (
    <div className="hero-background w-100">
      <Stack
        direction="vertical"
        gap={6}
        className="align-items-center px-2 pt-40 pb-20 px-lg-30 pt-lg-52 pb-lg-46 px-xxl-52"
      >
        <p
          className="m-0 fw-bold text-black text-center"
          style={{
            lineHeight: "95%",
            fontSize: isMobile ? 70 : isBigScreen ? 100 : 90,
          }}
        >
          Streaming
          <span className="text-flame-500"> money</span>
          <span className="text-primary"> solutions</span>
        </p>
        <p className="m-0 text-center fs-6">
          We build continuous funding apps, incentive systems & governance
          mechanisms so your capital flows to results.
        </p>
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          gap={6}
          className="justify-content-center align-items-center"
        >
          <Link href="/explore" style={{ width: isMobile ? 280 : 210 }}>
            <Button className="w-100 h-100 p-0 fs-lg fw-semi-bold rounded-4 py-4 border-4">
              Explore flows
            </Button>
          </Link>
          <Link
            href="https://docs.flowstate.network"
            target="_blank"
            style={{ width: isMobile ? 280 : 210 }}
          >
            <Button
              variant="outline-dark"
              className="w-100 h-100 p-0 fs-lg fw-semi-bold rounded-4 border-4 py-4"
            >
              Docs
            </Button>
          </Link>
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={10} className="pt-20 pb-16 pb-lg-20">
        <p className="fs-6 fw-bold text-center text-black-600">Trusted by</p>
        <Stack
          direction="horizontal"
          gap={isMobile ? 5 : 20}
          className="justify-content-center align-items-center flex-wrap"
        >
          <Image src="/octant.svg" alt="Octant" width={300} height={80} />
          <Image
            src="/superfluid.svg"
            alt="Superfluid"
            width={334}
            height={80}
          />
          <Image
            src="/good-dollar-wordmark.png"
            alt="Good Dollar"
            width={300}
            height={42}
          />
        </Stack>
      </Stack>
      <Stack
        direction="horizontal"
        gap={8}
        className="justify-content-lg-center align-items-center flex-wrap flex-lg-nowrap px-3 py-20 px-lg-30 px-xxl-52"
      >
        <p
          className="m-0 fw-bold text-black"
          style={{
            lineHeight: "95%",
            fontSize: isMobile ? 62 : 88,
            minWidth: isMobile ? "100%" : 517,
          }}
        >
          DYNAMIC
          <br />
          <span className="text-primary">CAPITAL</span>,
          <br />
          DYNAMIC
          <br />
          <span className="text-flame-500">RESULTS</span>
        </p>
        <Stack
          direction="vertical"
          className="flex-grow-0"
          style={{ width: isBigScreen ? 951 : isMobile ? "auto" : 651 }}
        >
          <p className="word-break fs-5 lh-sm">
            In web3, money and information flow on the same rails. Every batch
            payment is a missed chance to connect them.
            <br />
            <br />
            Streaming funding empowers you, your team, and your community to
            keep capital and results in sync.
          </p>
        </Stack>
      </Stack>
      <div className="background-body px-lg-30 px-xxl-52 py-lg-20">
        <Stack
          direction="vertical"
          className="align-items-center bg-lace-100 py-16 px-lg-17 px-xxl-30 py-lg-24"
          id="target-audience"
          style={{ borderRadius: isMobile || isTablet ? 0 : 56 }}
        >
          {isMobile || isTablet || isSmallScreen ? (
            <Dropdown className="mb-8 w-100 px-3">
              <Dropdown.Toggle
                variant="secondary"
                className="d-flex justify-content-between align-items-center w-100 px-10 py-4 rounded-4 fs-lg fw-semi-bold"
              >
                {showTargetAudience}
              </Dropdown.Toggle>
              <Dropdown.Menu className="bg-secondary p-3">
                <Dropdown.Item
                  className="fs-lg text-white fw-semi-bold"
                  onClick={() => setShowTargetAudience(TargetAudience.FUNDERS)}
                >
                  {TargetAudience.FUNDERS}
                </Dropdown.Item>
                <Dropdown.Item
                  className="fs-lg text-white fw-semi-bold"
                  onClick={() => setShowTargetAudience(TargetAudience.BUILDERS)}
                >
                  {TargetAudience.BUILDERS}
                </Dropdown.Item>
                <Dropdown.Item
                  className="fs-lg text-white fw-semi-bold"
                  onClick={() => setShowTargetAudience(TargetAudience.EVERYONE)}
                >
                  {TargetAudience.EVERYONE}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Stack
              direction="horizontal"
              gap={8}
              className="justify-content-center"
            >
              <Button
                variant={
                  showTargetAudience === TargetAudience.FUNDERS
                    ? "primary"
                    : "outline-dark"
                }
                className="px-10 py-4 fs-lg fw-semi-bold rounded-3 border-4"
                style={{ width: isMobile ? 280 : 220 }}
                onClick={() => setShowTargetAudience(TargetAudience.FUNDERS)}
              >
                For funders
              </Button>
              <Button
                variant={
                  showTargetAudience === TargetAudience.BUILDERS
                    ? "primary"
                    : "outline-dark"
                }
                className="px-10 py-4 fs-lg fw-semi-bold rounded-3 border-4"
                style={{ width: isMobile ? 280 : 220 }}
                onClick={() => setShowTargetAudience(TargetAudience.BUILDERS)}
              >
                For builders
              </Button>
              <Button
                variant={
                  showTargetAudience === TargetAudience.EVERYONE
                    ? "primary"
                    : "outline-dark"
                }
                className="px-10 py-4 fs-lg fw-semi-bold rounded-3 border-4"
                style={{ width: isMobile ? 280 : 220 }}
                onClick={() => setShowTargetAudience(TargetAudience.EVERYONE)}
              >
                For everyone
              </Button>
            </Stack>
          )}
          <p className="fs-5 fw-semi-bold text-primary px-2 mt-xl-8 mb-6 text-center">
            {showTargetAudience === TargetAudience.BUILDERS
              ? "Grow your app or token with Flow State money streaming"
              : "Drive results with one of Flow State’s incentive or governance systems"}
          </p>
          <Stack
            direction="horizontal"
            gap={8}
            className="justify-content-center align-items-start flex-wrap flex-xl-nowrap mb-8"
          >
            <Image
              src={
                showTargetAudience === TargetAudience.FUNDERS
                  ? "/audience-funders.png"
                  : showTargetAudience === TargetAudience.BUILDERS
                    ? "/audience-builders.png"
                    : "/audience-everyone.png"
              }
              alt=""
              width={isMobile || isTablet ? "100%" : isBigScreen ? 823 : 600}
              height={isMobile ? 280 : 680}
              style={{
                objectFit: "cover",
                borderRadius: isMobile || isTablet ? 0 : 66,
              }}
            />
            <Stack direction="vertical" className="flex-grow-0 px-8 px-lg-0">
              {showTargetAudience === TargetAudience.FUNDERS ? (
                <>
                  <p className="text-secondary fw-bold fs-5">
                    Return on Investment
                  </p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    Wield dynamic streams to create value-accruing feedback
                    loops.
                  </p>
                  <p className="text-secondary fw-bold fs-5">Attract Talent</p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    Beat the competition for top talent by funding faster and
                    with more consistency.
                  </p>
                  <p className="text-secondary fw-bold fs-5">
                    Capital Efficiency
                  </p>
                  <p className="fs-6 mb-16" style={{ lineHeight: "140%" }}>
                    Get more out of your limited resources by reducing idle
                    capital & decision-making overhead.
                  </p>
                  <p className="text-secondary fw-semi-bold fs-lg">
                    Learn more
                  </p>
                  <Stack direction="horizontal" gap={2}>
                    <Link href="/flow-councils">
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Flow Council
                      </Button>
                    </Link>
                    <Link href="/flow-splitters">
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Flow Splitter
                      </Button>
                    </Link>
                  </Stack>
                  <Stack direction="horizontal" gap={2}>
                    <Link
                      href="https://docs.flowstate.network/platform/streaming-qf"
                      target="_blank"
                    >
                      <Button
                        variant="outline-secondary"
                        className="mt-4 px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                        style={{ width: isMobile ? "100%" : 210 }}
                      >
                        Flow QF
                      </Button>
                    </Link>
                    <Link
                      href="#schedule-consultation"
                      onNavigate={(e) => {
                        e.preventDefault();
                        const elem = document.getElementById(
                          "schedule-consultation",
                        );
                        elem?.scrollIntoView({
                          behavior: "smooth",
                        });
                      }}
                    >
                      <Button
                        variant="outline-secondary"
                        className="mt-4 px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                        style={{ width: isMobile ? "100%" : 370 }}
                      >
                        Custom
                      </Button>
                    </Link>
                  </Stack>
                </>
              ) : showTargetAudience === TargetAudience.BUILDERS ? (
                <>
                  <p className="text-secondary fw-bold fs-5">User Retention</p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    Create instant and consistent token flows that keep users
                    coming back.
                  </p>
                  <p className="text-secondary fw-bold fs-5">Dynamic Rewards</p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    Adjust streams at scale based on any signal so rewards match
                    value.
                  </p>
                  <p className="text-secondary fw-bold fs-5">Differentiation</p>
                  <p className="fs-6 mb-16" style={{ lineHeight: "140%" }}>
                    Stand out against Web 2.0 & web3 competition alike with the
                    ultimate form of programmable money.
                  </p>
                  <p className="mb-4 text-secondary fw-semi-bold fs-lg">
                    Learn more
                  </p>
                  <Stack direction="horizontal" gap={2}>
                    <Link href="/flow-splitters">
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Flow Splitter
                      </Button>
                    </Link>
                    <Link
                      href="https://farcaster.xyz/miniapps/0EyeQpCD0lSP/flowcaster"
                      target="_blank"
                    >
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Flow Caster
                      </Button>
                    </Link>
                  </Stack>
                  <Link
                    href="#schedule-consultation"
                    onNavigate={(e) => {
                      e.preventDefault();
                      const elem = document.getElementById(
                        "schedule-consultation",
                      );
                      elem?.scrollIntoView({
                        behavior: "smooth",
                      });
                    }}
                  >
                    <Button
                      variant="outline-secondary"
                      className="mt-4 px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      style={{ width: isMobile ? "100%" : 370 }}
                    >
                      Custom
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-secondary fw-bold fs-5">Direct Impact</p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    See your contributions make a tangible difference in
                    real-time.
                  </p>
                  <p className="text-secondary fw-bold fs-5">Engagement</p>
                  <p className="fs-6" style={{ lineHeight: "140%" }}>
                    Participate in governance and decision-making processes
                    rather than bureaucracy.
                  </p>
                  <p className="text-secondary fw-bold fs-5">Onchain Magic</p>
                  <p className="fs-6 mb-16" style={{ lineHeight: "140%" }}>
                    Do things with programmable money unimaginable offchain.
                  </p>
                  <p className="mb-4 text-secondary fw-semi-bold fs-lg">
                    Learn more
                  </p>
                  <Stack direction="horizontal" gap={2}>
                    <Link href="https://docs.flowstate.network" target="_blank">
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Docs
                      </Button>
                    </Link>
                    <Link href="/explore">
                      <Button
                        variant="outline-secondary"
                        className="px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Explore
                      </Button>
                    </Link>
                  </Stack>
                  <Stack direction="horizontal" gap={2}>
                    <Link
                      href="https://farcaster.xyz/miniapps/0EyeQpCD0lSP/flowcaster"
                      target="_blank"
                    >
                      <Button
                        variant="outline-secondary"
                        className="mt-4 px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Flow Caster
                      </Button>
                    </Link>
                    <Link href="https://farcaster.xyz/beamr" target="_blank">
                      <Button
                        variant="outline-secondary"
                        className="mt-4 px-10 py-3 border-4 rounded-4 fs-lg fw-semi-bold"
                      >
                        Beamr
                      </Button>
                    </Link>
                  </Stack>
                </>
              )}
            </Stack>
          </Stack>
          <Stack
            direction="horizontal"
            className="justify-content-center"
            gap={3}
          >
            <Button
              variant="transparent"
              className="p-0 border-0"
              onClick={() => setShowTargetAudience(TargetAudience.FUNDERS)}
            >
              <Image
                src="/ellipse.svg"
                alt=""
                width={12}
                height={12}
                style={{
                  filter:
                    showTargetAudience === TargetAudience.FUNDERS
                      ? "brightness(0) saturate(100%) invert(35%) sepia(42%) saturate(362%) hue-rotate(115deg) brightness(88%) contrast(86%)"
                      : "brightness(0) saturate(100%) invert(93%) sepia(4%) saturate(2894%) hue-rotate(338deg) brightness(96%) contrast(88%)",
                }}
              />
            </Button>
            <Button
              variant="transparent"
              className="p-0 border-0"
              onClick={() => setShowTargetAudience(TargetAudience.BUILDERS)}
            >
              <Image
                src="/ellipse.svg"
                alt=""
                width={12}
                height={12}
                style={{
                  filter:
                    showTargetAudience === TargetAudience.BUILDERS
                      ? "brightness(0) saturate(100%) invert(35%) sepia(42%) saturate(362%) hue-rotate(115deg) brightness(88%) contrast(86%)"
                      : "brightness(0) saturate(100%) invert(93%) sepia(4%) saturate(2894%) hue-rotate(338deg) brightness(96%) contrast(88%)",
                }}
              />
            </Button>
            <Button
              variant="transparent"
              className="p-0 border-0"
              onClick={() => setShowTargetAudience(TargetAudience.EVERYONE)}
            >
              <Image
                src="/ellipse.svg"
                alt=""
                width={12}
                height={12}
                style={{
                  filter:
                    showTargetAudience === TargetAudience.EVERYONE
                      ? "brightness(0) saturate(100%) invert(35%) sepia(42%) saturate(362%) hue-rotate(115deg) brightness(88%) contrast(86%)"
                      : "brightness(0) saturate(100%) invert(93%) sepia(4%) saturate(2894%) hue-rotate(338deg) brightness(96%) contrast(88%)",
                }}
              />
            </Button>
          </Stack>
        </Stack>
        <Stack
          id="schedule-consultation"
          direction="vertical"
          gap={5}
          className="align-items-center px-3 pt-20 pb-30 px-lg-52"
        >
          <p
            className="m-0 text-secondary text-center fw-bold"
            style={{ fontSize: 88, lineHeight: "95%" }}
          >
            Ready to find your flow state?
          </p>
          <p className="m-0 text-center fs-6" style={{ lineHeight: "140%" }}>
            We can design, build, and integrate a streaming funding solution for
            your unique needs.
          </p>
          <Button
            variant="link"
            href="https://calendar.app.google/VR16gZEyus6xqn2s8"
            target="_blank"
            className="mt-2 bg-secondary text-white text-decoration-none px-10 py-4 fs-lg fw-semi-bold"
          >
            Schedule a consultation
          </Button>
        </Stack>
      </div>
    </div>
  );
}
