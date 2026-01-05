import { useState, useEffect } from "react";
import { Address, formatEther } from "viem";
import { useReadContract } from "wagmi";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { ProjectMetadata } from "@/types/project";
import { Token } from "@/types/token";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import useFlowCouncil from "../hooks/flowCouncil";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { truncateStr, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeDetails = {
  id: string;
  metadata: ProjectMetadata;
  placeholderLogo: string;
  granteeAddress: `0x${string}`;
  chainId: number;
  token: Token;
  canAddToBallot: boolean;
  hide: () => void;
};

export default function GranteeDetails(props: GranteeDetails) {
  const {
    id,
    metadata,
    token,
    placeholderLogo,
    granteeAddress,
    chainId,
    canAddToBallot,
    hide,
  } = props;

  const [imageUrl, setImageUrl] = useState("");

  const { isMobile } = useMediaQuery();
  const { dispatchNewAllocation, distributionPool } = useFlowCouncil();
  const { data: totalAmountReceivedByMember, dataUpdatedAt } = useReadContract({
    chainId,
    address: distributionPool?.id as Address,
    abi: superfluidPoolAbi,
    functionName: "getTotalAmountReceivedByMember",
    args: [granteeAddress as Address],
    query: { enabled: !!distributionPool && !!granteeAddress },
  });

  const poolMember = distributionPool?.poolMembers.find(
    (m) => m.account.id === granteeAddress.toLowerCase(),
  );
  const adjustedPoolFlowRate = distributionPool
    ? BigInt(distributionPool.flowRate) -
      BigInt(distributionPool.adjustmentFlowRate)
    : BigInt(0);
  const memberFlowRate =
    poolMember && distributionPool && BigInt(distributionPool.totalUnits) > 0
      ? (BigInt(poolMember.units) * adjustedPoolFlowRate) /
        BigInt(distributionPool.totalUnits)
      : BigInt(0);
  const totalFundingReceived = useFlowingAmount(
    totalAmountReceivedByMember ?? BigInt(0),
    dataUpdatedAt ? Math.round(dataUpdatedAt / 1000) : 0,
    memberFlowRate,
  );
  const superfluidExplorer = networks.find(
    (network) => network.id === chainId,
  )?.superfluidExplorer;

  useEffect(() => {
    (async () => {
      if (metadata.logoImg) {
        const imageUrl = await fetchIpfsImage(metadata.logoImg);

        setImageUrl(imageUrl);
      }
    })();
  }, [metadata.logoImg]);

  return (
    <Offcanvas
      show
      onHide={hide}
      placement={isMobile ? "bottom" : "end"}
      className="p-4"
      style={{ height: "100%" }}
    >
      <Offcanvas.Header closeButton className="pb-0">
        <Offcanvas.Title className="fs-5 fw-semi-bold">
          Recipient Details
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4">
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-center my-3"
          >
            <Image
              src={imageUrl !== "" ? imageUrl : placeholderLogo}
              alt=""
              width={96}
              height={96}
              className="ms-2 rounded-4"
            />
            <Card className="bg-transparent border-0 ms-3">
              <Card.Title className="fw-semi-bold text-secondary m-0">
                {metadata.title}
              </Card.Title>
              <Card.Subtitle className="m-0">
                <Card.Link
                  href={`${superfluidExplorer}/accounts/${granteeAddress}`}
                  target="_blank"
                  className="text-info"
                >
                  {truncateStr(granteeAddress, 12)}
                </Card.Link>
              </Card.Subtitle>
            </Card>
          </Stack>
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-end text-info px-2 mb-2"
          >
            {!!metadata.website && (
              <Button
                variant="link"
                href={metadata.website}
                target="_blank"
                className="p-0"
              >
                <Image src="/web.svg" alt="Web" width={20} height={20} />
              </Button>
            )}
            {!!metadata.projectGithub && (
              <Button
                variant="link"
                href={`https://github.com/${metadata.projectGithub}`}
                target="_blank"
                className="p-0"
              >
                <Image src="/github.svg" alt="Github" width={18} height={18} />
              </Button>
            )}
            {!!metadata.projectTwitter && (
              <Button
                variant="link"
                href={`https://x.com/${metadata.projectTwitter}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/x-logo.svg"
                  alt="X Social Network"
                  width={13}
                  height={13}
                />
              </Button>
            )}
            {!!metadata.projectWarpcast && (
              <Button
                variant="link"
                href={`https://farcaster.xyz/${metadata.projectWarpcast}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/farcaster.svg"
                  alt="Farcaster"
                  width={16}
                  height={16}
                />
              </Button>
            )}
            {!!metadata.projectLens && (
              <Button
                variant="link"
                href={`https://hey.xyz/u/${metadata.projectLens}`}
                target="_blank"
                className="p-0"
              >
                <Image src="/hey.png" alt="lens" width={16} height={16} />
              </Button>
            )}
            {!!metadata.projectGuild && (
              <Button
                variant="link"
                href={`https://guild.xyz/${metadata.projectGuild}`}
                target="_blank"
                className="p-0"
              >
                <Image src="/guild.svg" alt="guild" width={18} height={18} />
              </Button>
            )}
            {!!metadata.projectTelegram && (
              <Button
                variant="link"
                href={`https://t.me/${metadata.projectTelegram}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/telegram.svg"
                  alt="telegram"
                  width={18}
                  height={18}
                />
              </Button>
            )}
            {!!metadata.projectDiscord && (
              <Button
                variant="link"
                href={`https://discord.com/invite/${metadata.projectDiscord}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/discord.svg"
                  alt="discord"
                  width={20}
                  height={20}
                />
              </Button>
            )}
            {!!metadata.karmaGap && (
              <Button
                variant="link"
                href={`https://gap.karmahq.xyz/project/${metadata.karmaGap}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/karma-gap.svg"
                  alt="discord"
                  width={20}
                  height={20}
                />
              </Button>
            )}
          </Stack>
          <Stack direction="horizontal" gap={1} className="p-2 pb-0">
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-nowrap text-center">
                Votes
              </Card.Text>
              <Badge className="bg-secondary rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(Number(poolMember?.units ?? 0))}
              </Badge>
            </Stack>
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-center">
                {token.symbol}/mo
              </Card.Text>
              <Badge className="bg-primary rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(
                  Number(
                    formatEther(memberFlowRate * BigInt(SECONDS_IN_MONTH)),
                  ),
                )}
              </Badge>
            </Stack>
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-nowrap text-center">
                Total
              </Card.Text>
              <Badge className="bg-info rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(Number(formatEther(totalFundingReceived)))}
              </Badge>
            </Stack>
          </Stack>
          <div style={{ maxWidth: 500 }} className="mt-2">
            <Markdown
              className="p-2"
              skipHtml={true}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehyperExternalLinks, { target: "_blank" }]]}
              components={{
                table: (props) => (
                  <table className="table table-striped" {...props} />
                ),
              }}
            >
              {metadata.description.replaceAll("•", "-")}
            </Markdown>
          </div>
          {canAddToBallot && (
            <Button
              className="d-flex gap-2 justify-content-center align-items-center px-10 py-4 rounded-4 fw-semi-bold"
              onClick={() =>
                dispatchNewAllocation({
                  type: "add",
                  allocation: {
                    recipient: granteeAddress,
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
          )}
          <Button
            variant="link"
            href={
              metadata?.karmaGap
                ? `https://gap.karmahq.xyz/project/${metadata.karmaGap}`
                : `/projects/${id}/?chainId=${chainId}`
            }
            target="_blank"
            className="d-flex justify-content-center align-items-center gap-2 mt-2 px-10 py-4 rounded-4 bg-secondary text-light text-decoration-none fw-semi-bold"
          >
            <Image
              src="/open-new.svg"
              alt=""
              width={24}
              height={24}
              style={{
                filter:
                  "invert(100%) sepia(0%) saturate(7497%) hue-rotate(175deg) brightness(103%) contrast(103%)",
              }}
            />
            {metadata?.karmaGap ? "Karma GAP" : "Project Page"}
          </Button>
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
