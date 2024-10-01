import Link from "next/link";
import { useRouter } from "next/router";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Button from "react-bootstrap/Button";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Index() {
  const router = useRouter();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();

  return (
    <Container
      className="mx-auto p-0"
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
        className="justify-content-center p-3 p-sm-5"
      >
        <Stack direction="vertical" className="align-self-center">
          {(isMobile || isTablet) && (
            <Image
              src="/flow-state-diagram.gif"
              alt="Diagram"
              width="100%"
              height="auto"
              className="mb-3"
            />
          )}
          <h1 style={{ fontSize: 64 }}>Find Your Flow State</h1>
          <p className="fs-4 mb-4">
            Creating, sustaining, and rewarding impact.
          </p>
          <Stack
            direction="horizontal"
            gap={2}
            className={`align-items-stretch
              ${isMobile || isTablet ? "w-100" : "w-75"}`}
          >
            <Button
              className="w-50 text-light fs-5"
              onClick={() => router.push("/projects/?new=true")}
            >
              Create Project
            </Button>
            <Button disabled className="w-50 fs-5">
              Launch SQF Round
            </Button>
          </Stack>
          <Button
            className="mt-4 text-light fs-5"
            style={{ width: isMobile || isTablet ? "100%" : "75%" }}
            onClick={() => router.push("/pool")}
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
        className="position-relative justify-content-start m-auto px-3 px-sm-5 py-3"
        style={{ height: 325 }}
      >
        <Image
          src="/single-person.png"
          alt="Single Person"
          width={253}
          height={325}
          className="position-absolute z-0"
        />
        <span
          className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-3 p-sm-5"
          style={{ left: "25%" }}
        />
        <p className="z-1 m-0 fs-3 text-center">
          flow state - n. (1): a mental state where a person is fully immersed
          in an activity, performing at their peak
        </p>
      </Stack>
      <p className="px-3 px-sm-5 fs-1">Making Impact Common</p>
      <p className="px-3 px-sm-5 fs-4 lh-1">
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
        privatized. At Flow State, we believe we cam make impact common.{" "}
        <Link
          href="/interest-form"
          target="_blank"
          className="text-decoration-underline p-0 fs-4"
        >
          Join us.
        </Link>
      </p>
      <Stack
        direction="horizontal"
        className="position-relative justify-content-start m-auto my-5 my-sm-0 px-3 px-sm-5 py-3"
        style={{ height: isMobile ? 158 : 315 }}
      >
        <Image
          src="/small-group.png"
          alt="Small Group"
          width={isMobile ? 327 : 436}
          height={isMobile ? 236 : 315}
          className="position-absolute z-0"
        />
        <span
          className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-3 p-sm-5"
          style={{ left: "25%" }}
        />
        <p className="z-1 m-0 fs-3 text-center">
          flow state - n. (2): onchain collective intelligence that continuously
          & dynamically allocates resources
        </p>
      </Stack>
      <Stack direction="vertical" className="p-3 p-sm-5">
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          gap={isMobile ? 3 : 5}
        >
          <Stack
            direction="vertical"
            className="justify-content-center align-items-center bg-light rounded-4 p-3 p-sm-5 text-center fs-4"
            style={{ width: isMobile ? "100%" : "66%" }}
          >
            Octant Builder Accelerator
            <br />
            Streaming Quadratic Funding Round
          </Stack>
          <Stack
            direction="vertical"
            className="justify-content-center align-items-center bg-light rounded-4 p-3 p-sm-5 text-center fs-4"
            style={{ width: isMobile ? "100%" : "33%%" }}
          >
            Grow Network Regens <br />
            Streaming Quadratic Funding Round
          </Stack>
        </Stack>
        <Link
          href="/explore"
          className="ms-auto mt-1 text-decoration-underline fs-4"
        >
          Explore More
        </Link>
      </Stack>
      <Stack
        direction="horizontal"
        className="position-relative justify-content-start m-auto px-3 py-3"
      >
        <Image src="/large-group.png" alt="Large Group" className="z-0" fluid />
        <span
          className="d-none d-sm-block position-absolute z-1 w-50 border-top border-bottom border-black m-auto p-5"
          style={{ left: "25%" }}
        />
        <p
          className="position-absolute start-50 translate-middle-x z-1 m-0 fs-3 text-center"
          style={{
            whiteSpace: !isMobile && !isTablet ? "" : "",
            minWidth: "80%",
          }}
        >
          Flow State - n. (3): digital coop that retroactively rewards members'
          labor & capital contributions to the public good
        </p>
      </Stack>
      <Stack
        direction="vertical"
        style={{ width: isMobile ? 300 : isTablet ? 600 : 1000 }}
        className="position-relative m-auto mt-3 mb-5"
      >
        <Stack
          direction="horizontal"
          className="w-100 border border-bottom-0 border-black p-3"
          gap={5}
        >
          <Image
            src="/placeholders/1.jpg"
            alt="Placeholder"
            width={64}
            height={64}
            className="rounded-circle"
          />
          <Stack direction="vertical">
            <p className="fs4 text-decoration-underline m-0">0x12..3456</p>{" "}
            <p className="fs-3 m-0">
              Opened a 23 DAIx/mo stream to{" "}
              <span className="text-decoration-underline">RadicalxChange</span>
            </p>{" "}
            <p className="align-self-end m-0">1 minute ago</p>{" "}
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="w-100 border border-bottom-0 border-black p-3"
          gap={5}
        >
          <Image
            src="/placeholders/2.jpg"
            alt="Placeholder"
            width={64}
            height={64}
            className="rounded-circle"
          />
          <Stack direction="vertical">
            <p className="fs4 m-0">
              <span className="text-decoration-underline">
                Kevin (0x24..2345)
              </span>{" "}
              to <span className="text-decoration-underline">Flow State</span>
            </p>{" "}
            <p className="fs-3 m-0">Keep up the great work!</p>{" "}
            <p className="align-self-end m-0">23 hours ago</p>{" "}
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="w-100 border border-bottom-0 border-black p-3"
          gap={5}
        >
          <Image
            src="/placeholders/3.jpg"
            alt="Placeholder"
            width={64}
            height={64}
            className="rounded-circle"
          />
          <Stack direction="vertical">
            <p className="fs-4 m-0 text-decoration-underline">Flow State</p>{" "}
            <p className="fs-3 m-0">
              We Launched an SQF round on February 22, 2024
            </p>{" "}
            <p className="align-self-end m-0">August 7, 2024</p>{" "}
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="w-100 border border-black p-3"
          gap={5}
        >
          <Image
            src="/placeholders/4.jpg"
            alt="Placeholder"
            width={64}
            height={64}
            className="rounded-circle"
          />
          <Stack direction="vertical">
            <p className="fs-3 m-0">
              <span className="text-decoration-underline">RadicalxChange</span>{" "}
              was added to the{" "}
              <span className="text-decoration-underline">
                Octant Builder Accelerator
              </span>{" "}
              round.
            </p>{" "}
            <p className="align-self-end m-0">August 7, 2024</p>{" "}
          </Stack>
        </Stack>
        <span
          className="position-absolute bottom-50 start-50 translate-middle bg-white text-danger fs-1 text-center"
          style={{
            width: isMobile ? "75%" : isTablet ? "40%" : "33%",
            rotate: isMobile ? "" : "-30deg",
            fontSize: 48,
          }}
        >
          Holon Feed Coming Soon
        </span>
      </Stack>
    </Container>
  );
}
