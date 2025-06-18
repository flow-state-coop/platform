import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { createVerifiedFetch } from "@helia/verified-fetch";
import removeMarkdown from "remove-markdown";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Token } from "@/types/token";
import useCouncil from "../hooks/council";
import { formatNumber } from "@/lib/utils";
import { IPFS_GATEWAYS, SECONDS_IN_MONTH } from "@/lib/constants";

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
  allocationPercentage: number;
  onClick?: () => void;
  votingPower?: number;
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
    allocationPercentage = 0,
    onAllocationChange,
    onClick,
    votingPower = 100,
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

  useEffect(() => {
    (async () => {
      const verifiedFetch = await createVerifiedFetch({
        gateways: IPFS_GATEWAYS,
      });

      if (logoCid) {
        try {
          const logoRes = await verifiedFetch(`ipfs://${logoCid}`);
          const logoBlob = await logoRes.blob();
          const logoUrl = URL.createObjectURL(logoBlob);

          setLogoUrl(logoUrl);
        } catch (err) {
          console.error(err);
        }
      }

      if (bannerCid) {
        try {
          const bannerRes = await verifiedFetch(`ipfs://${bannerCid}`);
          const bannerBlob = await bannerRes.blob();
          const bannerUrl = URL.createObjectURL(bannerBlob);

          setBannerUrl(bannerUrl);
        } catch (err) {
          console.error(err);
        }
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

  const handleSlide = (e) => {
    e.stopPropagation();
    const container = e.currentTarget;

    const startingX = e.clientX;
    const containerWidth = container.clientWidth;
    const containerBoundingRect = container.getBoundingClientRect();

    const move = (e) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      const newPercentage = Math.max(
        0,
        ((e.clientX - 32 - containerBoundingRect.left) /
          (containerBoundingRect.width - 32)) *
          100,
      );

      /*
      if (onAllocationChange) {
        onAllocationChange(newPercentage);
      }
       */

      const votingAmount = calculateAllocationVotes(newPercentage);
      const otherAllocations = newAllocation?.allocation.filter(
        (allocation) => allocation.grantee !== granteeAddress,
      );
      const totalOtherVotes =
        otherAllocations?.reduce(
          (sum, allocation) => sum + allocation.amount,
          0,
        ) ?? 0;

      const maxAllowedVotes = votingPower - totalOtherVotes;
      const validVotingAmount = Math.min(votingAmount, maxAllowedVotes);

      /*
      if (validVotingAmount !== votingAmount && onAllocationChange) {
        const validPercentage = (validVotingAmount / votingPower) * 100;

        onAllocationChange(validPercentage);
      }
       */

      const granteeAllocation = newAllocation?.allocation.find(
        (allocation) => allocation.grantee === granteeAddress,
      );
      setPercentage(newPercentage);

      dispatchNewAllocation({
        type: !granteeAllocation
          ? "add"
          : validVotingAmount === 0
            ? "delete"
            : "update",
        allocation: {
          grantee: granteeAddress,
          amount: validVotingAmount,
        },
      });
    };

    move(e);

    container.addEventListener("mousemove", move);
    container.addEventListener("mouseup", () => {
      container.releasePointerCapture(e.pointerId);
      container.removeEventListener("mousemove", move);
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
          <div className="d-flex justify-content-center mt-3">
            <small className="fw-bold" style={{ color: granteeColor }}>
              {calculateAllocationVotes(allocationPercentage)} votes
            </small>
          </div>
        </Card.Body>
        <Card.Footer
          className="position-relative border-0 px-0 py-0 rounded-3"
          onClick={(e) => handleAllocation(e)}
        >
          <Stack
            direction="horizontal"
            className="w-100"
            onMouseDown={handleSlide}
            style={{
              width: "100%",
              height: "100%",
            }}
          >
            <div
              className="rounded-start-3"
              style={{
                width: `${percentage}%`,
                height: "100%",
                background: granteeColor,
                transition: "background 0.3s ease",
                cursor: "pointer",
                accentColor: granteeColor,
              }}
            />
            <Button
              className="p-0 h-100 border-0 rounded-start-0 rounded-end-3"
              style={{ background: granteeColor }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
              }}
            >
              <Image src="/drag.svg" alt="Drag" width={32} height={32} />
            </Button>
          </Stack>
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between w-100 px-3"
          >
            <div className="d-flex align-items-center">
              <span
                className="fw-bold me-3"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {allocationPercentage.toFixed(1)}%
              </span>
            </div>
          </Stack>
        </Card.Footer>
      </Card>
    </>
  );
}
