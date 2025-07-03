import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import removeMarkdown from "remove-markdown";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Token } from "@/types/token";
import { CouncilMember } from "../types/councilMember";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import useCouncil from "../hooks/council";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeProps = {
  name: string;
  granteeAddress: `0x${string}`;
  description: string;
  logoCid: string;
  bannerCid: string;
  placeholderLogo: string;
  placeholderBanner: string;
  flowRate: bigint;
  units: number;
  token: Token;
  onAllocationChange?: (value: number) => void;
  onClick?: () => void;
  votingPower: number;
  granteeColor: string;
};

export default function Grantee(props: GranteeProps) {
  const {
    name,
    granteeAddress,
    description,
    logoCid,
    bannerCid,
    placeholderLogo,
    placeholderBanner,
    flowRate,
    units,
    token,
    onAllocationChange,
    onClick,
    votingPower,
    granteeColor,
  } = props;

  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const { newAllocation, dispatchNewAllocation } = useCouncil();
  const [percentage, setPercentage] = useState(0);
  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });

  const monthlyFlow = Number(formatEther(flowRate * BigInt(SECONDS_IN_MONTH)));
  const granteeAllocation = newAllocation?.allocation.find(
    (allocation) => allocation.grantee === granteeAddress,
  );

  useEffect(() => {
    if (!newAllocation) {
      return;
    }

    const vote =
      newAllocation.allocation.find(
        (allocation) =>
          allocation.grantee.toLowerCase() === granteeAddress.toLowerCase(),
      )?.amount ?? 0;

    setPercentage((vote / votingPower) * 100);
  }, [newAllocation]);

  useEffect(() => {
    (async () => {
      if (logoCid) {
        const logoUrl = await fetchIpfsImage(logoCid);

        setLogoUrl(logoUrl);
      }

      if (bannerCid) {
        const bannerUrl = await fetchIpfsImage(bannerCid);

        setBannerUrl(bannerUrl);
      }
    })();
  }, [logoCid, bannerCid]);

  const handleAllocation = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (onClick) onClick();
  };

  const calculateAllocationVotes = (percentage: number): number => {
    return Math.round((percentage / 100) * votingPower);
  };

  const handleSlide = (e: React.MouseEvent | React.TouchEvent) => {
    if (!granteeAllocation) {
      return;
    }

    e.stopPropagation();
    const container = e.currentTarget;

    const containerWidth = container.clientWidth;
    const containerBoundingRect = container.getBoundingClientRect();

    const move = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const touchEvent = e as TouchEvent;
      const clientX = touchEvent.touches
        ? touchEvent.touches[0].clientX
        : mouseEvent.clientX;
      const containerPercentage = Math.max(
        0,
        ((clientX - 32 - containerBoundingRect.left) /
          (containerBoundingRect.width - 32)) *
          100,
      );
      const otherAllocations = newAllocation?.allocation.filter(
        (allocation) => allocation.grantee !== granteeAddress,
      );
      const totalOtherVotes =
        otherAllocations?.reduce(
          (sum, allocation) => sum + allocation.amount,
          0,
        ) ?? 0;
      const maxAllowedPercentage = Math.round(
        ((votingPower - totalOtherVotes) / votingPower) * 100,
      );
      const newPercentage = Math.min(containerPercentage, maxAllowedPercentage);
      const votingAmount = calculateAllocationVotes(newPercentage);
      const maxAllowedVotes = votingPower - totalOtherVotes;
      const validVotingAmount = Math.min(votingAmount, maxAllowedVotes);

      dispatchNewAllocation({
        type: "update",
        allocation: {
          grantee: granteeAddress,
          amount: validVotingAmount,
        },
      });

      setPercentage(newPercentage);
    };

    move(e.nativeEvent);

    container.addEventListener("mousemove", move);
    container.addEventListener("touchmove", move);
    window.addEventListener("mouseup", () => {
      container.removeEventListener("mousemove", move);
    });
    window.addEventListener("touchend", () => {
      container.removeEventListener("touchmove", move);
    });
  };

  return (
    <>
      <Card
        className="rounded-4 overflow-hidden"
        style={{
          height: 420,
          border: "1px solid #212529",
          boxShadow: "0 0 12px rgba(36, 119, 137, 0.5)",
          transition: "all 0.2s ease-in-out",
        }}
      >
        <Card.Img
          variant="top"
          src={bannerUrl === "" ? placeholderBanner : bannerUrl}
          height={102}
          className="bg-light"
        />
        <Image
          src={logoUrl === "" ? placeholderLogo : logoUrl}
          alt=""
          width={52}
          height={52}
          className="rounded-3 position-absolute border border-2 border-light bg-white"
          style={{ bottom: 300, left: 16 }}
        />
        <Card.Body className="mt-3 pb-0">
          <Card.Text
            className="d-inline-block m-0 fs-5 word-wrap text-truncate"
            style={{ maxWidth: 256 }}
          >
            {name}
          </Card.Text>
          <Card.Text
            ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
            className="m-0 mb-3"
            style={{ fontSize: "0.9rem", minHeight: noClamp ? "4lh" : "auto" }}
          >
            {clampedText}
          </Card.Text>
          <Stack direction="horizontal" className="me-2">
            <Stack direction="vertical" className="align-items-center w-33">
              <Card.Text as="small" className="m-0 fw-bold">
                Total Votes
              </Card.Text>
              <Card.Text as="small" className="m-0">
                {units}
              </Card.Text>
            </Stack>
            <Stack direction="vertical" className="align-items-center w-33">
              <Card.Text as="small" className="m-0 fw-bold">
                Current Stream
              </Card.Text>
              <Card.Text as="small" className="m-0">
                {formatNumber(monthlyFlow)} {token.symbol} /mo
              </Card.Text>
            </Stack>
          </Stack>
          {votingPower && (
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
                {calculateAllocationVotes(percentage)} votes
              </Card.Text>
            </Stack>
          )}
        </Card.Body>
        <Card.Footer
          className="position-relative border-0 px-0 py-0 rounded-3"
          onClick={(e) => handleAllocation(e)}
        >
          {granteeAllocation ? (
            <>
              <Stack
                direction="horizontal"
                className="w-100"
                onMouseDown={handleSlide}
                onTouchStart={handleSlide}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              >
                <Stack
                  direction="horizontal"
                  className="align-items-center rounded-start-3"
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
                      className="fw-bold text-light px-3"
                      style={{ pointerEvents: "none" }}
                    >
                      {percentage.toFixed(0)}%
                    </Card.Text>
                  )}
                </Stack>
                <Button
                  className={`p-0 h-100 border-0 rounded-end-3 ${percentage > 0 ? "rounded-start-0" : "rounded-start-3"}`}
                  style={{ background: granteeColor }}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                  }}
                >
                  <Image
                    src="/drag.svg"
                    alt="Drag"
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
            <Stack
              direction="horizontal"
              className="justify-content-center py-2"
            >
              <Button
                className="d-flex gap-1 align-items-center px-4"
                onClick={() =>
                  dispatchNewAllocation({
                    type: "add",
                    allocation: {
                      grantee: granteeAddress,
                      amount: 1,
                    },
                  })
                }
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
          ) : null}
        </Card.Footer>
      </Card>
    </>
  );
}
