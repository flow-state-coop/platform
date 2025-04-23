import { useState, useEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { createVerifiedFetch } from "@helia/verified-fetch";
import removeMarkdown from "remove-markdown";
import { useClampText } from "use-clamp-text";
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
import { IPFS_GATEWAYS, SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeProps = {
  id: string;
  name: string;
  granteeAddress: string;
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

  return (
    <>
      <Card
        className="rounded-4 overflow-hidden"
        style={{
          height: 400,
          border: isSelected ? "1px solid #247789" : "1px solid #212529",
          boxShadow: isSelected ? "0px 0px 0px 2px #247789" : "",
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
                {Intl.NumberFormat("en", {
                  notation: monthlyFlow > 1000 ? "compact" : void 0,
                  maximumFractionDigits:
                    monthlyFlow < 1
                      ? 4
                      : monthlyFlow < 10
                        ? 3
                        : monthlyFlow < 100
                          ? 2
                          : 1,
                }).format(monthlyFlow)}{" "}
                {token.symbol} /mo
              </Card.Text>
            </Stack>
          </Stack>
        </Card.Body>
        <Card.Footer
          className="d-flex justify-content-between border-0 py-3"
          style={{ fontSize: "15px", background: "rgb(215, 215, 220)" }}
        >
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between w-100"
          >
            {isCouncilMember && (
              <Button
                variant={hasAllocated ? "secondary" : "primary"}
                onClick={() => {
                  if (hasAllocated) {
                    if (
                      newAllocation?.allocation &&
                      newAllocation.allocation.length > 0
                    ) {
                      dispatchNewAllocation({ type: "show-ballot" });
                    } else {
                      dispatchNewAllocation({
                        type: "add",
                        currentAllocation,
                      });
                    }
                  } else {
                    dispatchNewAllocation({
                      type: "add",
                      allocation: { grantee: granteeAddress, amount: 0 },
                      currentAllocation,
                    });
                    setShowToast(true);
                  }
                }}
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
              <Image src="/open-new.svg" alt="Profile" width={28} height={28} />
            </Button>
          </Stack>
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
