import { useState, useEffect } from "react";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Token } from "@/types/token";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { roundWeiAmount } from "@/lib/utils";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeProps = {
  name: string;
  description: string;
  logoCid: string;
  bannerCid: string;
  placeholderLogo: string;
  placeholderBanner: string;
  allocationFlowRate: bigint;
  allocatorsCount: number;
  matchingFlowRate: bigint;
  impactMatchingEstimate: bigint;
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  userFlowRate: bigint | null;
  isSelected: boolean;
  selectGrantee: () => void;
};

export default function Grantee(props: GranteeProps) {
  const {
    name,
    description,
    logoCid,
    bannerCid,
    placeholderLogo,
    placeholderBanner,
    allocationFlowRate,
    allocatorsCount,
    matchingFlowRate,
    impactMatchingEstimate,
    allocationTokenInfo,
    matchingTokenInfo,
    userFlowRate,
    isSelected,
    selectGrantee,
  } = props;

  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });
  const monthlyAllocation = roundWeiAmount(
    allocationFlowRate * BigInt(SECONDS_IN_MONTH),
    allocationTokenInfo.symbol.startsWith("ETH") ? 4 : 2,
  );
  const monthlyMatching = roundWeiAmount(
    matchingFlowRate * BigInt(SECONDS_IN_MONTH),
    matchingTokenInfo.symbol.startsWith("ETH") ? 4 : 2,
  );
  const monthlyImpactMatchingEstimate = roundWeiAmount(
    impactMatchingEstimate * BigInt(SECONDS_IN_MONTH),
    2,
  );

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

  return (
    <Card
      className="rounded-4 overflow-hidden cursor-pointer shadow border-4 border-dark"
      style={{
        height: 438,
        border: isSelected ? "4px solid #056589" : "",
      }}
      onClick={selectGrantee}
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
        className="rounded-3 position-absolute border border-4 border-light bg-white"
        style={{ bottom: 303, left: 16 }}
      />
      <Card.Body className="mt-3 p-4">
        <Card.Text
          className="d-inline-block m-0 fs-lg fw-semi-bold word-wrap text-truncate"
          style={{ maxWidth: 256 }}
        >
          {name}
        </Card.Text>
        <Card.Text
          ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
          className="m-0 mt-3 mb-8"
          style={{ minHeight: noClamp ? "4lh" : "auto" }}
        >
          {clampedText}
        </Card.Text>
        <Stack direction="horizontal" className="me-3 lh-sm">
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0">
              Donors
            </Card.Text>
            <Card.Text as="small" className="m-0 fw-semi-bold">
              {allocatorsCount}
            </Card.Text>
          </Stack>
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0">
              Direct
            </Card.Text>
            <Card.Text as="small" className="m-0 fw-semi-bold">
              {monthlyAllocation}
            </Card.Text>
            <Stack
              direction="horizontal"
              gap={1}
              className="flex-wrap justify-content-center"
            >
              <Card.Text as="small" className="m-0 fw-semi-bold">
                {allocationTokenInfo.symbol}
              </Card.Text>
              <Card.Text as="small" className="m-0 fw-semi-bold">
                /mo
              </Card.Text>
            </Stack>
          </Stack>
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0">
              Matching
            </Card.Text>
            <Card.Text as="small" className="m-0 fw-semi-bold">
              {monthlyMatching}
            </Card.Text>
            <Stack
              direction="horizontal"
              gap={1}
              className="flex-wrap justify-content-center"
            >
              <Card.Text as="small" className="m-0 fw-semi-bold">
                {matchingTokenInfo.symbol}
              </Card.Text>
              <Card.Text as="small" className="m-0 fw-semi-bold">
                /mo
              </Card.Text>
            </Stack>
          </Stack>
        </Stack>
      </Card.Body>
      <Card.Footer className="d-flex justify-content-between bg-lace-100 border-0 p-4 lh-sm">
        <Stack direction="vertical" className="flex-grow-0">
          {userFlowRate ? (
            <>
              <Card.Text as="small" className="m-0">
                Your Stream
              </Card.Text>
              <Card.Text as="small" className="m-0 fw-semi-bold">
                {roundWeiAmount(
                  userFlowRate * BigInt(SECONDS_IN_MONTH),
                  allocationTokenInfo.symbol.startsWith("ETH") ? 4 : 2,
                )}{" "}
                {allocationTokenInfo.symbol}
                /mo
              </Card.Text>
            </>
          ) : (
            <>
              <Card.Text as="small" className="m-0">
                Matching Multiplier
              </Card.Text>
              {allocationTokenInfo.symbol === "ETHx" ||
              allocationTokenInfo.symbol === "CELOx" ? (
                <Card.Text className="m-0 text-center fw-semi-bold">
                  x
                  {parseFloat(
                    (
                      Number(
                        roundWeiAmount(
                          impactMatchingEstimate * BigInt(SECONDS_IN_MONTH),
                          18,
                        ),
                      ) /
                      getPoolFlowRateConfig(allocationTokenInfo.symbol)
                        .minAllocationPerMonth
                    ).toFixed(2),
                  )}
                </Card.Text>
              ) : (
                <Card.Text as="small" className="m-0 text-truncate">
                  1 {allocationTokenInfo.symbol} ={" "}
                  {monthlyImpactMatchingEstimate} {matchingTokenInfo.symbol}
                </Card.Text>
              )}
            </>
          )}
        </Stack>
        <Button className="w-33 p-0 text-light py-4 rounded-4 fw-semi-bold">
          Donate
        </Button>
      </Card.Footer>
    </Card>
  );
}
