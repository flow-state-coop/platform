import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { createVerifiedFetch } from "@helia/verified-fetch";
import removeMarkdown from "remove-markdown";
import { useClampText } from "use-clamp-text";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Toast from "react-bootstrap/Toast";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { CouncilMember } from "../types/councilMember";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "../hooks/council";
import { formatNumber } from "@/lib/utils";
import { IPFS_GATEWAYS, SECONDS_IN_MONTH } from "@/lib/constants";
import styles from "./RangeSlider.module.css";

type GranteeProps = {
  id: string;
  name: string;
  granteeAddress: `0x${string}`;
  description: string;
  logoCid: string;
  bannerCid: string;
  placeholderLogo: string;
  placeholderBanner: string;
  flowRate: bigint;
  units: number;
  network: Network;
  token: Token;
  isSelected: boolean;
  allocationPercentage?: number;
  onAllocationChange?: (value: number) => void;
  onClick?: () => void;
  votingPower?: number;
  pieColor?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharedPieData?: any[];
};

export default function Grantee(props: GranteeProps) {
  const {
    id,
    name,
    granteeAddress,
    description,
    logoCid,
    bannerCid,
    placeholderLogo,
    placeholderBanner,
    flowRate,
    units,
    network,
    token,
    isSelected,
    allocationPercentage = 0,
    onAllocationChange,
    onClick,
    votingPower = 100,
    pieColor = "rgb(36, 119, 137)",
    sharedPieData = [],
  } = props;

  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [showToast, setShowToast] = useState(false);

  const { address } = useAccount();
  const { isMobile } = useMediaQuery();
  const { newAllocation, council, currentAllocation, dispatchNewAllocation } =
    useCouncil();
  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });
  const isCouncilMember = !!council?.councilMembers?.find(
    (councilMember: CouncilMember) =>
      councilMember.account === address?.toLowerCase(),
  );
  const hasAllocated =
    !!currentAllocation?.allocation?.find(
      (allocation: { grantee: string }) =>
        allocation.grantee === granteeAddress,
    ) ||
    !!newAllocation?.allocation?.find(
      (allocation: { grantee: string }) =>
        allocation.grantee === granteeAddress,
    );

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

    setShowToast(true);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive =
      target.tagName === "BUTTON" ||
      target.closest("button") ||
      target.tagName === "A" ||
      target.closest("a") ||
      target.tagName === "INPUT" ||
      target.closest("input") ||
      target.classList.contains(styles.rangeSlider) ||
      target.closest(`.${styles.rangeSlider}`);

    if (!isInteractive && isCouncilMember) {
      handleAllocation(e);
    }
  };

  // Function to calculate allocation in actual votes based on percentage and voting power
  const calculateAllocationVotes = (percentage: number): number => {
    return Math.round((percentage / 100) * votingPower);
  };

  // Render the pie chart with the shared data structure
  const renderGranteePieChart = () => {
    // If no shared data or the grantee isn't selected, don't show the chart
    if (!isSelected || !sharedPieData || sharedPieData.length === 0) {
      return null;
    }

    // Create a modified version of the shared data that highlights only this grantee
    const cardPieData = sharedPieData.map((entry) => ({
      ...entry,
      // Only use the grantee's color for this grantee, make all others grey
      color: entry.id === granteeAddress ? pieColor : "#e0e0e0",
    }));

    // Make sure we have at least some data to display
    if (cardPieData.length === 0) {
      // If no data, show a placeholder grey circle
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[{ name: "Unallocated", value: 100, color: "#e0e0e0" }]}
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius={16}
              fill="#e0e0e0"
              dataKey="value"
              startAngle={-90}
              endAngle={270}
            >
              <Cell fill="#e0e0e0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    // Check if we have a "remaining" wedge; if not, add one for unallocated votes
    const hasRemainingWedge = cardPieData.some(
      (entry) => entry.id === "remaining",
    );
    const totalAllocated = cardPieData.reduce(
      (sum, entry) => sum + (entry.id !== "remaining" ? entry.value : 0),
      0,
    );

    // If there are unallocated votes but no remaining wedge, add one
    if (!hasRemainingWedge && totalAllocated < votingPower) {
      cardPieData.push({
        id: "remaining",
        name: "Unallocated",
        value: votingPower - totalAllocated,
        color: "#e0e0e0",
      });
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={cardPieData}
            cx="50%"
            cy="50%"
            innerRadius={0}
            outerRadius={16}
            fill="#8884d8"
            paddingAngle={0}
            dataKey="value"
            startAngle={-90}
            endAngle={270}
          >
            {cardPieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <>
      <Card
        className="rounded-4 overflow-hidden cursor-pointer"
        style={{
          height: 400,
          border: "1px solid #212529",
          boxShadow: isSelected ? "0 0 12px rgba(36, 119, 137, 0.5)" : "none",
          transition: "all 0.2s ease-in-out",
        }}
        onClick={handleCardClick}
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
          style={{ bottom: 270, left: 16 }}
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
        </Card.Body>
        {isSelected && (
          <>
            <div className="d-flex justify-content-center text-center mt-1">
              <small className="text-muted">
                {calculateAllocationVotes(allocationPercentage)} votes (
                {allocationPercentage}%)
              </small>
            </div>
            <div
              className="position-relative px-3"
              style={{
                marginBottom: "-8px",
                marginTop: "-21px",
                zIndex: 5,
                touchAction: "none", // Prevent scroll/zoom on the container level
              }}
              onTouchStart={(e) => {
                // Prevent parent card from receiving touch events
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
            >
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={allocationPercentage}
                onChange={(e) => {
                  e.stopPropagation();
                  const newPercentage = Number(e.target.value);
                  if (onAllocationChange) {
                    onAllocationChange(newPercentage);
                  }

                  // Also update the ballot allocation
                  if (newAllocation?.allocation) {
                    const granteeAllocation = newAllocation.allocation.find(
                      (allocation) => allocation.grantee === granteeAddress,
                    );

                    if (granteeAllocation) {
                      // Convert percentage to absolute voting amount
                      const votingAmount =
                        calculateAllocationVotes(newPercentage);

                      // Check if updating would exceed total voting power
                      const otherAllocations = newAllocation.allocation.filter(
                        (allocation) => allocation.grantee !== granteeAddress,
                      );

                      const totalOtherVotes = otherAllocations.reduce(
                        (sum, allocation) => sum + allocation.amount,
                        0,
                      );

                      // If the new allocation would exceed available votes, cap it
                      const maxAllowedVotes = votingPower - totalOtherVotes;
                      const validVotingAmount = Math.min(
                        votingAmount,
                        maxAllowedVotes,
                      );

                      // If the amount was capped, also update the UI percentage
                      if (
                        validVotingAmount !== votingAmount &&
                        onAllocationChange
                      ) {
                        const validPercentage =
                          (validVotingAmount / votingPower) * 100;
                        onAllocationChange(validPercentage);
                      }

                      dispatchNewAllocation({
                        type: "update",
                        allocation: {
                          grantee: granteeAddress,
                          amount: validVotingAmount,
                        },
                      });
                    }
                  }
                }}
                className={styles.rangeSlider}
                style={{
                  cursor: "pointer",
                  accentColor: pieColor,
                }}
                onClick={(e) => e.stopPropagation()}
                // Add touch event handlers to prevent screen scrolling
                onTouchStart={(e) => {
                  e.stopPropagation();
                  // Prevent page scrolling when touching slider
                  document.body.style.overflow = "hidden";
                  // Prevent default behavior which causes scrolling
                  e.preventDefault();
                }}
                onTouchMove={(e) => {
                  // Prevent the default scrolling behavior
                  e.stopPropagation();
                  e.preventDefault();
                  // Get touch position relative to slider
                  const touch = e.touches[0];
                  const slider = e.currentTarget;
                  const rect = slider.getBoundingClientRect();
                  const position = (touch.clientX - rect.left) / rect.width;
                  // Calculate new value (clamped between 0-100)
                  const newValue = Math.max(
                    0,
                    Math.min(100, Math.round(position * 100)),
                  );
                  // Update slider value and trigger onChange
                  slider.value = newValue.toString();
                  // Trigger a change event to update the UI and state
                  const changeEvent = new Event("change", { bubbles: true });
                  slider.dispatchEvent(changeEvent);
                }}
                onTouchEnd={(e) => {
                  // Re-enable scrolling when touch is complete
                  document.body.style.overflow = "";
                  e.stopPropagation();
                }}
                aria-label="Allocation percentage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={allocationPercentage}
              />
            </div>
          </>
        )}
        <Card.Footer
          className="d-flex justify-content-between border-0 py-3"
          style={{
            fontSize: "15px",
            background: isSelected
              ? `linear-gradient(to right, ${pieColor} 0%, ${pieColor} ${allocationPercentage}%, rgb(65, 198, 223) ${allocationPercentage}%, rgb(65, 198, 223) 100%)`
              : "rgb(215, 215, 220)",
            color: isSelected ? "white" : "inherit",
            transition: "background 0.3s ease",
          }}
          onClick={(e) => handleAllocation(e)}
        >
          {isSelected ? (
            <Stack
              direction="horizontal"
              gap={2}
              className="justify-content-between w-100"
            >
              <div className="d-flex align-items-center">
                <span className="fw-bold me-3">
                  {allocationPercentage.toFixed(1)}%
                </span>
                <div style={{ width: "32px", height: "32px" }}>
                  {renderGranteePieChart()}
                </div>
              </div>
              <span>Selected</span>
            </Stack>
          ) : (
            <Stack
              direction="horizontal"
              gap={2}
              className="justify-content-between w-100"
            >
              {isCouncilMember && (
                <Button
                  variant={hasAllocated ? "secondary" : "primary"}
                  onClick={handleAllocation}
                  className="d-flex justify-content-center align-items-center gap-1 w-33 px-5"
                >
                  {hasAllocated ? (
                    <Image
                      src="/success.svg"
                      alt="Done"
                      width={20}
                      height={20}
                      style={{
                        filter:
                          "invert(100%) sepia(100%) saturate(0%) hue-rotate(160deg) brightness(103%) contrast(103%)",
                      }}
                    />
                  ) : (
                    <Image
                      src="/add.svg"
                      alt="Add"
                      width={16}
                      height={16}
                      style={{
                        filter:
                          "invert(100%) sepia(100%) saturate(2%) hue-rotate(281deg) brightness(107%) contrast(101%)",
                      }}
                    />
                  )}
                  <Image
                    src="/ballot.svg"
                    alt="Cart"
                    width={22}
                    height={22}
                    style={{
                      filter:
                        "invert(100%) sepia(100%) saturate(0%) hue-rotate(160deg) brightness(103%) contrast(103%)",
                    }}
                  />
                </Button>
              )}
              <Button
                variant="link"
                href={`https://flowstate.network/projects/${id}/?chainId=${network.id}`}
                target="_blank"
                className="d-flex justify-content-center ms-auto p-0"
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
      <Toast
        show={showToast}
        delay={3000}
        autohide
        style={{
          position: "fixed",
          top: 20,
          right: isMobile ? "" : 20,
          background: "rgb(219, 252.2, 221)",
          color: "rgb(30, 96.4, 34)",
          zIndex: 2,
        }}
        onClose={() => setShowToast(false)}
      >
        <Toast.Body>
          <b>Added to ballot!</b>
          <br />
          Don't forget to submit it with a transaction.
        </Toast.Body>
      </Toast>
    </>
  );
}
