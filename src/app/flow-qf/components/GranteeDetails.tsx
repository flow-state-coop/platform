import { useState, useEffect } from "react";
import { formatEther, Address } from "viem";
import { useReadContract } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import CopyTooltip from "@/components/CopyTooltip";
import removeMarkdown from "remove-markdown";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { GDAPool } from "@/types/gdaPool";
import { getApolloClient } from "@/lib/apollo";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import { Inflow } from "@/types/inflow";
import { Outflow } from "@/types/outflow";
import { ProjectMetadata } from "@/types/project";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface GranteeDetailsProps {
  metadata: ProjectMetadata;
  placeholderLogo: string;
  poolUiLink: string;
  recipientAddress: string;
  inflow: Inflow;
  matchingPool: GDAPool;
  matchingFlowRate: bigint;
  userOutflow: Outflow | null;
  recipientId: string;
  chainId?: number;
}

const PROFILE_ID_QUERY = gql`
  query ProfileIdByAnchor($anchorAddress: String!, $chainId: Int!) {
    profiles(condition: { anchorAddress: $anchorAddress, chainId: $chainId }) {
      id
    }
  }
`;

export default function GranteeDetails(props: GranteeDetailsProps) {
  const {
    metadata,
    placeholderLogo,
    poolUiLink,
    recipientAddress,
    inflow,
    matchingPool,
    matchingFlowRate,
    userOutflow,
    recipientId,
    chainId,
  } = props;

  const [readMore, setReadMore] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const matchingPoolMember = matchingPool?.poolMembers.find(
    (member) => member.account.id === recipientAddress,
  );

  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(metadata.description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });
  const { data: flowStateQueryRes } = useQuery(PROFILE_ID_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      anchorAddress: recipientId,
      chainId,
    },
    skip: !chainId,
  });
  const { data: totalAmountReceivedByMember, dataUpdatedAt } = useReadContract({
    chainId,
    address: matchingPool?.id as Address,
    abi: superfluidPoolAbi,
    functionName: "getTotalAmountReceivedByMember",
    args: [matchingPoolMember?.account.id as Address],
    query: { enabled: !!matchingPool && !!matchingPoolMember },
  });

  const profileId = flowStateQueryRes?.profiles[0]?.id ?? "";
  const totalAllocatedUser = useFlowingAmount(
    BigInt(userOutflow?.streamedUntilUpdatedAt ?? 0),
    userOutflow?.updatedAtTimestamp ?? 0,
    BigInt(userOutflow?.currentFlowRate ?? 0),
  );
  const totalAllocatedOthers =
    useFlowingAmount(
      BigInt(inflow?.totalAmountStreamedInUntilUpdatedAt ?? BigInt(0)),
      inflow?.updatedAtTimestamp ?? 0,
      BigInt(inflow?.totalInflowRate ?? 0),
    ) - totalAllocatedUser;
  const totalMatching = useFlowingAmount(
    totalAmountReceivedByMember ?? BigInt(0),
    dataUpdatedAt ? Math.round(dataUpdatedAt / 1000) : 0,
    matchingFlowRate,
  );

  useEffect(() => {
    (async () => {
      if (!metadata.logoImg) {
        return;
      }

      const imageUrl = await fetchIpfsImage(metadata.logoImg);

      setImageUrl(imageUrl);
    })();
  }, [metadata.logoImg]);

  return (
    <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4 mt-8">
      <Stack direction="horizontal" gap={2} className="align-items-start">
        <Image
          src={imageUrl === "" ? placeholderLogo : imageUrl}
          alt="logo"
          width={96}
          height={96}
          className="ms-2 rounded-4"
        />
        <Card className="bg-transparent border-0 ms-2">
          <Card.Link
            href={`/projects/${profileId}/?chainId=${chainId}`}
            target="_blank"
            className="fs-lg fw-semi-bold text-secondary mb-2 text-decoration-none"
          >
            {metadata.title}
          </Card.Link>
        </Card>
      </Stack>
      <Stack
        direction="horizontal"
        gap={1}
        className="align-items-center text-info p-2"
      >
        {!!metadata.website && (
          <Button
            variant="link"
            href={metadata.website}
            target="_blank"
            className="ms-1 p-0"
          >
            <Image src="/web.svg" alt="Web" width={18} height={18} />
          </Button>
        )}
        {!!metadata.projectGithub && (
          <Button
            variant="link"
            href={`https://github.com/${metadata.projectGithub}`}
            target="_blank"
            className="ms-1 p-0"
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
            <Image src="/telegram.svg" alt="telegram" width={18} height={18} />
          </Button>
        )}
        {!!metadata.projectDiscord && (
          <Button
            variant="link"
            href={`https://discord.com/invite/${metadata.projectDiscord}`}
            target="_blank"
            className="p-0"
          >
            <Image src="/discord.svg" alt="discord" width={20} height={20} />
          </Button>
        )}
        <CopyTooltip
          contentClick="Link copied"
          contentHover="Copy link"
          handleCopy={() => navigator.clipboard.writeText(poolUiLink)}
          target={
            <Image
              src="/link.svg"
              alt="link"
              width={24}
              height={24}
              style={{ marginTop: 2 }}
            />
          }
        />
      </Stack>
      <Stack direction="horizontal" gap={1} className="p-2 pb-0">
        <Stack direction="vertical" gap={1} className="w-33">
          <Card.Text className="m-0 pe-0">You</Card.Text>
          <Badge className="bg-primary rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(
              Number(
                formatEther(
                  BigInt(userOutflow?.currentFlowRate ?? 0) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-33">
          <Card.Text className="m-0 pe-0 text-nowrap">Others</Card.Text>
          <Badge className="bg-secondary rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(
              Number(
                formatEther(
                  (BigInt(inflow?.totalInflowRate ?? 0) -
                    BigInt(userOutflow?.currentFlowRate ?? 0)) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-33">
          <Card.Text className="m-0 pe-0 text-nowrap">Match</Card.Text>
          <Badge className="bg-info rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(
              Number(formatEther(matchingFlowRate * BigInt(SECONDS_IN_MONTH))),
            )}
          </Badge>
        </Stack>
        <Card.Text className="w-20 mt-3 ms-1" style={{ fontSize: "0.7rem" }}>
          monthly
        </Card.Text>
      </Stack>
      <Stack direction="horizontal" gap={1} className="p-2">
        <Stack direction="vertical" gap={1} className="w-33">
          <Badge className="bg-primary rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(Number(formatEther(totalAllocatedUser)))}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-33">
          <Badge className="bg-secondary rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(Number(formatEther(totalAllocatedOthers)))}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-33">
          <Badge className="bg-info rounded-2 p-2 text-start fw-semi-bold">
            {formatNumber(Number(formatEther(totalMatching)))}
          </Badge>
        </Stack>
        <Card.Text className="w-20 ms-1" style={{ fontSize: "0.7rem" }}>
          total
        </Card.Text>
      </Stack>
      {readMore || noClamp ? (
        <>
          <div style={{ maxWidth: 500 }}>
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
          <Button
            variant="link"
            href={`/projects/${profileId}/?chainId=${chainId}`}
            target="_blank"
            className="d-flex justify-content-center align-items-center gap-2 bg-primary shadow-none text-light text-decoration-none py-4 rounded-4 fw-semi-bold"
          >
            Project Page
            <Image
              src="/open-new.svg"
              alt="Open New"
              width={20}
              height={20}
              style={{
                filter:
                  "invert(99%) sepia(1%) saturate(2877%) hue-rotate(199deg) brightness(123%) contrast(89%)",
              }}
            />
          </Button>
        </>
      ) : (
        <Card.Text
          ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
          className="m-0 p-2 fw-semi-bold"
          style={{ maxWidth: 500 }}
        >
          {clampedText}
        </Card.Text>
      )}
      {(!noClamp || readMore) && (
        <Button
          variant="transparent"
          className="mt-4 p-0 border-0 shadow-none"
          onClick={() => setReadMore(!readMore)}
        >
          <Image
            src={readMore ? "/expand-less.svg" : "/expand-more.svg"}
            alt="expand"
            width={20}
          />
        </Button>
      )}
    </Stack>
  );
}
