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
      className="rounded-4 overflow-hidden cursor-pointer shadow"
      style={{
        height: 438,
        border: isSelected ? "1px solid #247789" : "",
        boxShadow: isSelected ? "0px 0px 0px 2px #247789" : "",
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
        className="rounded-3 position-absolute border border-2 border-light bg-white"
        style={{ bottom: 308, left: 16 }}
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
        <Stack direction="horizontal" className="me-3">
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0 fw-bold">
              Donors
            </Card.Text>
            <Card.Text as="small" className="m-0">
              {allocatorsCount}
            </Card.Text>
          </Stack>
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0 fw-bold">
              Direct
            </Card.Text>
            <Card.Text as="small" className="m-0">
              {monthlyAllocation}
            </Card.Text>
            <Stack
              direction="horizontal"
              gap={1}
              className="flex-wrap justify-content-center"
            >
              <Card.Text as="small" className="m-0">
                {allocationTokenInfo.symbol}
              </Card.Text>
              <Card.Text as="small" className="m-0">
                /mo
              </Card.Text>
            </Stack>
          </Stack>
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="m-0 fw-bold">
              Matching
            </Card.Text>
            <Card.Text as="small" className="m-0">
              {monthlyMatching}
            </Card.Text>
            <Stack
              direction="horizontal"
              gap={1}
              className="flex-wrap justify-content-center"
            >
              <Card.Text as="small" className="m-0">
                {matchingTokenInfo.symbol}
              </Card.Text>
              <Card.Text as="small" className="m-0">
                /mo
              </Card.Text>
            </Stack>
          </Stack>
        </Stack>
      </Card.Body>
      <Card.Footer
        className="d-flex justify-content-between bg-light border-0 py-3"
        style={{ fontSize: "15px" }}
      >
        <Stack direction="vertical" className="flex-grow-0">
          {userFlowRate ? (
            <>
              <Card.Text as="small" className="m-0 fw-bold">
                Your Stream
              </Card.Text>
              <Card.Text as="small" className="m-0">
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
              <Card.Text as="small" className="m-0 fw-bold">
                Matching Multiplier
              </Card.Text>
              {allocationTokenInfo.symbol === "ETHx" ||
              allocationTokenInfo.symbol === "CELOx" ? (
                <Card.Text className="m-0 text-center">
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
        <Button className="w-33 p-0 text-light">Donate</Button>
      </Card.Footer>
    </Card>
  );
}
