import { useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { usePostHog } from "posthog-js/react";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Button from "react-bootstrap/Button";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Index() {
  const router = useRouter();
  const poolsRef = useRef<HTMLDivElement>(null);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();
  const postHog = usePostHog();

  const handleScrollToPools = () => {
    poolsRef?.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  return (
    <Container
      className="mx-auto p-0 mb-5"
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
      <Stack
        direction={isMobile || isTablet ? "vertical" : "horizontal"}
        gap={isMobile || isTablet ? 5 : 0}
        className="justify-content-center my-4 mt-sm-5 mb-sm-2 px-4"
      >
        <Stack direction="vertical" className="align-self-center">
          {(isMobile || isTablet) && (
            <Image
              src="/flow-state-diagram.gif"
              alt="Diagram"
              width="100%"
              height="auto"
              className="my-4"
            />
          )}
          <h1 style={{ fontSize: 42 }} className="fw-bold">
            Find Your Flow State
          </h1>
          <p className="mb-4 fs-5">
            Creating, sustaining, and rewarding impact.
          </p>
          <Stack
            direction="horizontal"
            gap={2}
            className={`align-items-stretch
              ${isMobile || isTablet ? "w-100" : "w-75"}`}
          >
            <Button
              className="w-50 text-light fs-5 shadow"
              onClick={() => router.push("/projects/?new=true")}
            >
              Create Project
            </Button>
            <Button
              variant="link"
              href="https://forms.gle/M98DjjGaxwFUhDTx5"
              target="_blank"
              className="w-50 text-white fs-5 shadow"
              style={{ background: "#33a8c2" }}
            >
              Launch SQF Round
            </Button>
          </Stack>
          <Button
            className="bg-secondary mt-3 text-light fs-5 shadow"
            style={{ width: isMobile || isTablet ? "100%" : "75%" }}
            onClick={handleScrollToPools}
          >
            Fund Public Goods
          </Button>
        </Stack>
        {!isMobile && !isTablet && (
          <Image
            src="/flow-state-diagram.gif"
            alt="Diagram"
            width={612}
            height={406}
          />
        )}
      </Stack>
      <Stack
        direction="horizontal"
        className="position-relative justify-content-center m-auto mt-sm-5 mt-sm-2 px-3 px-sm-5"
        style={{ height: 466 }}
      >
        <Image
          src="/single-person.png"
          alt="Single Person"
          width={isMobile ? 300 : 493}
          height={isMobile ? 294 : 466}
          className="position-absolute z-0"
        />
        <span
          className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-3 p-sm-5 p-lg-4"
          style={{ left: "25%" }}
        />
        <p className="z-1 m-0 fs-5 text-center">
          flow state - n. (1): a mental state where a person is fully immersed
          in an activity, performing at their peak
        </p>
      </Stack>
      <p className="mt-5 px-3 px-sm-5 pt-5 fs-2">Making Impact Common</p>
      <p className="px-3 px-sm-5 pb-sm-5 fs-5">
        Builder-first grants programs are good for impact. That means they're
        good for the supporters & communities that back them.
        <br />
        <br />
        Flow State's holistic impact approach helps attract the best talent. It
        provides them the support, financial & not, to sustain their team, focus
        deeply on their mission, & solve big hairy problems. It also recognizes
        that altruism isn't enough. Rewarding funders that unlock impact creates
        a virtuous cycle.
        <br />
        <br />
        Audacious breakthroughs are uncommon: they're infrequent and too often
        privatized. At Flow State, we believe we can make impact common.{" "}
        <Link
          href="https://forms.gle/VXfRSpAzynTmjvRY9"
          target="_blank"
          className="text-decoration-underline p-0"
        >
          Join us.
        </Link>
      </p>
      <Stack
        direction="horizontal"
        className="position-relative justify-content-center m-auto my-sm-5 px-3 px-sm-5 py-3"
        style={{ height: 415 }}
      >
        <Image
          src="/small-group.png"
          alt="Small Group"
          width={isMobile ? 300 : 673}
          height={isMobile ? 200 : 415}
          className="position-absolute z-0"
        />
        <span
          className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-3 p-sm-5 p-lg-4"
          style={{ left: "25%" }}
        />
        <p className="z-1 m-0 fs-5 text-center">
          flow state - n. (2): onchain collective intelligence that continuously
          & dynamically allocates resources
        </p>
      </Stack>
      <Stack ref={poolsRef} direction="vertical" className="p-3 p-sm-5 mt-5">
        <p className="fs-2">Live & Upcoming Rounds</p>
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          gap={isMobile ? 3 : 5}
        >
          <Stack
            direction="vertical"
            className="justify-content-center align-items-center rounded-4 p-3 p-sm-4 shadow cursor-pointer"
            style={{
              width: isMobile ? "100%" : "60%",
              background: "#A0C7D4",
              fontFamily: "Helvetica",
            }}
            onClick={() => router.push("/octant")}
          >
            <p className="m-0 fs-4 fw-bold">Octant Builder Accelerator SQF</p>
            <p className="m-0 fs-5">Live on October 24 - 16+ ETH Matching</p>
            <Stack
              direction="horizontal"
              gap={isMobile ? 3 : isTablet ? 4 : 5}
              className="justify-content-center mt-4"
            >
              <Image
                src="/octant.svg"
                alt="Octant"
                width={isMobile ? 135 : 180}
                height={isMobile ? 37 : 50}
              />
              <Image
                src="/superfluid.svg"
                alt="Superfluid"
                width={isMobile ? 135 : 180}
                height={isMobile ? 37 : 50}
              />
            </Stack>
          </Stack>
          <Stack
            direction="vertical"
            className="justify-content-center align-items-center rounded-4 p-2 p-sm-4 pb-sm-3 shadow cursor-pointer"
            style={{
              width: isMobile ? "100%" : "40%",
              background: "#33A8C2",
              fontFamily: "Helvetica",
            }}
            onClick={() => router.push("/core")}
          >
            <p className="m-0 fs-4 fw-bold">Flow State Core</p>
            <p className="m-0 fs-5">Live on October 24</p>
            <Stack
              direction="horizontal"
              className="justify-content-center mt-1"
            >
              <Image src="/logo.png" alt="Flow State" width={87} height={84} />
            </Stack>
          </Stack>
        </Stack>
      </Stack>
      <div
        className="px-0 px-sm-4"
        style={{ margin: isMobile ? "128px 0 128px 0" : "" }}
      >
        <Stack
          direction="horizontal"
          className="position-relative justify-content-center m-auto px-4 py-3 mt-5"
        >
          <Image
            src="/coop-group.png"
            alt="Coop Group"
            className="z-0"
            width="100%"
            height="auto"
          />
          <span
            className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-4 p-sm-5 p-lg-4"
            style={{ left: "25%" }}
          />
          <p
            className="position-absolute top-50 start-50 translate-middle z-1 m-0 fs-5 text-center"
            style={{
              minWidth: "80%",
            }}
          >
            Flow State - n. (3): digital coop that retroactively rewards
            members' labor & capital contributions to the public good
          </p>
        </Stack>
      </div>
      <Stack direction="vertical" className="my-5 px-4">
        <p className="fs-2 mb-0 px-sm-4">Join Flow State</p>
        <p className="fs-5 mb-4 px-sm-4">
          Govern the co-op. Earn profit distributions (patronage) for funding,
          being funded, & contributing to public goods. Make impact common.
        </p>
        <Button
          variant="link"
          target="_blank"
          href="https://forms.gle/VXfRSpAzynTmjvRY9"
          className="bg-primary m-auto mb-5 fs-5 text-light"
          style={{ width: isMobile ? "100%" : isTablet ? "50%" : "25%" }}
        >
          Membership Interest Form
        </Button>
      </Stack>
    </Container>
  );
}
