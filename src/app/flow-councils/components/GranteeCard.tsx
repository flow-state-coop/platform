import { useMemo, useEffect, useState } from "react";
import { formatEther } from "viem";
import removeMarkdown from "remove-markdown";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Token } from "@/types/token";
import useFlowCouncil from "../hooks/flowCouncil";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeProps = {
  projectId: string;
  name: string;
  granteeAddress: `0x${string}`;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  placeholderLogo: string;
  placeholderBanner: string;
  flowRate: bigint;
  units: number;
  token: Token;
  showGranteeDetails: () => void;
  votingPower: number;
  granteeColor: string;
  onAddToBallot: () => void;
};

export default function Grantee(props: GranteeProps) {
  const {
    projectId,
    name,
    granteeAddress,
    description,
    logoUrl,
    bannerUrl,
    placeholderLogo,
    placeholderBanner,
    flowRate,
    units,
    token,
    showGranteeDetails,
    votingPower,
    granteeColor,
    onAddToBallot,
  } = props;

  const { newBallot, dispatchNewBallot } = useFlowCouncil();
  const [percentage, setPercentage] = useState(0);
  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });

  const monthlyFlow = Number(formatEther(flowRate * BigInt(SECONDS_IN_MONTH)));

  const granteeVote = useMemo(
    () => newBallot?.votes.find((v) => v.recipient === granteeAddress),
    [newBallot, granteeAddress],
  );

  useEffect(() => {
    if (!newBallot?.votes) {
      return;
    }

    const votes =
      newBallot.votes.find((v) => v.recipient === granteeAddress)?.amount ?? 0;

    setPercentage((votes / votingPower) * 100);
  }, [newBallot, granteeAddress, votingPower]);

  const handleSlide = (e: React.MouseEvent | React.TouchEvent) => {
    if (!granteeVote) {
      return;
    }

    e.stopPropagation();
    const container = e.currentTarget;

    const containerBoundingRect = container.getBoundingClientRect();

    const move = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const touchEvent = e as TouchEvent;
      const clientX = touchEvent.touches
        ? touchEvent.touches[0].clientX
        : mouseEvent.clientX;
      const newPercentage = Math.max(
        0,
        ((clientX - 32 - containerBoundingRect.left) /
          (containerBoundingRect.width - 32)) *
          100,
      );
      const votingAmount = Math.round((newPercentage / 100) * votingPower);

      dispatchNewBallot({
        type: "update",
        vote: {
          recipient: granteeAddress,
          amount: votingAmount,
        },
      });

      setPercentage(newPercentage);
    };

    move(e.nativeEvent);

    container.addEventListener("mousemove", move);
    container.addEventListener("touchmove", move);
    window.addEventListener(
      "mouseup",
      () => {
        container.removeEventListener("mousemove", move);
      },
      { once: true },
    );
    window.addEventListener(
      "touchend",
      () => {
        container.removeEventListener("touchmove", move);
      },
      { once: true },
    );
  };

  return (
    <>
      <Card
        className="rounded-5 border border-4 border-dark overflow-hidden cursor-pointer shadow"
        onClick={showGranteeDetails}
        style={{
          height: 430,
          transition: "all 0.2s ease-in-out",
        }}
      >
        <Card.Img
          variant="top"
          src={bannerUrl || placeholderBanner}
          height={102}
          className="bg-lace-100"
        />
        <a
          href={`/projects/${projectId}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="position-absolute"
          style={{ bottom: 295, left: 16 }}
        >
          <Image
            src={logoUrl || placeholderLogo}
            alt=""
            width={52}
            height={52}
            className="rounded-4 border border-4 border-white bg-white"
          />
        </a>
        <Card.Body className="mt-5 p-4 pb-0">
          <a
            href={`/projects/${projectId}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="d-inline-block m-0 fs-lg fw-semi-bold word-wrap text-truncate text-decoration-none text-dark"
            style={{ maxWidth: 256 }}
          >
            {name}
          </a>
          <Card.Text
            ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
            style={{ fontSize: "0.9rem", minHeight: noClamp ? "4lh" : "auto" }}
          >
            {clampedText}
          </Card.Text>
          <Stack direction="horizontal" className="me-2">
            <Stack direction="vertical" className="align-items-center w-33">
              <Card.Text as="small" className="mb-1">
                Total Votes
              </Card.Text>
              <Card.Text as="small" className="m-0 fw-bold">
                {units}
              </Card.Text>
            </Stack>
            <Stack direction="vertical" className="align-items-center w-33">
              <Card.Text as="small" className="mb-1">
                Current Stream
              </Card.Text>
              <Card.Text as="small" className="m-0 fw-bold">
                {formatNumber(monthlyFlow)} {token.symbol} /mo
              </Card.Text>
            </Stack>
          </Stack>
          {!!votingPower && granteeVote && (
            <Stack
              direction="horizontal"
              className="justify-content-center mt-4"
            >
              <Card.Text
                className="fw-bold small m-0"
                style={{ color: granteeColor }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {granteeVote.amount === 1
                  ? `${granteeVote.amount} vote`
                  : granteeVote.amount > 1
                    ? `${granteeVote.amount} votes`
                    : null}
              </Card.Text>
            </Stack>
          )}
        </Card.Body>
        <Card.Footer className="position-relative bg-lace-100 border-0 px-0 py-0 rounded-3">
          {votingPower && granteeVote ? (
            <>
              <Stack
                direction="horizontal"
                className="w-100"
                onMouseDown={handleSlide}
                onTouchStart={handleSlide}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              >
                <Stack
                  direction="horizontal"
                  className="align-items-center rounded-start-4"
                  style={{
                    width: `${percentage}%`,
                    height: 52,
                    background: granteeColor,
                    transition: "background 0.3s ease",
                    cursor: "pointer",
                    accentColor: granteeColor,
                  }}
                >
                  {percentage > 20 && (
                    <Card.Text
                      className="fw-bold text-light px-3 unselectable"
                      style={{ pointerEvents: "none" }}
                    >
                      {percentage.toFixed(0)}%
                    </Card.Text>
                  )}
                </Stack>
                <Button
                  className={`p-0 h-100 border-0 rounded-end-4 ${percentage > 0 ? "rounded-start-0" : "rounded-start-4"}`}
                  style={{ background: granteeColor }}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                >
                  <Image
                    src="/drag.svg"
                    alt=""
                    width={32}
                    height={32}
                    style={{
                      filter:
                        "invert(100%) sepia(0%) saturate(7497%) hue-rotate(175deg) brightness(103%) contrast(103%)",
                    }}
                  />
                </Button>
              </Stack>
            </>
          ) : votingPower ? (
            <Stack direction="horizontal" className="justify-content-center">
              <Button
                className="d-flex gap-1 justify-content-center align-items-center w-100 px-10 py-4 rounded-4 fw-semi-bold"
                style={{ paddingTop: 14, paddingBottom: 14 }}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatchNewBallot({
                    type: "add",
                    vote: {
                      recipient: granteeAddress,
                      amount: 1,
                    },
                  });
                  setTimeout(onAddToBallot, 100);
                }}
              >
                <Image
                  src="/add.svg"
                  alt=""
                  width={24}
                  height={24}
                  style={{
                    filter:
                      "invert(100%) sepia(0%) saturate(7497%) hue-rotate(175deg) brightness(103%) contrast(103%)",
                  }}
                />
                Add to Ballot
              </Button>
            </Stack>
          ) : (
            <Stack
              direction="horizontal"
              className="justify-content-end"
              style={{
                width: "100%",
                height: 52,
              }}
            >
              <Button
                variant="transparent"
                className="d-flex justify-content-center ms-auto p-0 pe-3"
              >
                <Image
                  src="/open-new.svg"
                  alt="Profile"
                  width={28}
                  height={28}
                />
              </Button>
            </Stack>
          )}
        </Card.Footer>
      </Card>
    </>
  );
}
