import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import { GDAPool } from "@/types/gdaPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface MatchingPoolDetailsProps {
  poolName: string;
  description: string;
  matchingPool: GDAPool;
}

export default function MatchingPoolDetails(props: MatchingPoolDetailsProps) {
  const { poolName, description, matchingPool } = props;

  const [readMore, setReadMore] = useState(false);

  const { address } = useAccount();
  const [descriptionRef, { clampedText, noClamp }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });

  const userDistributionInfo = useMemo(() => {
    if (address && matchingPool) {
      const distributor = matchingPool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return {
          totalDistributedUserUntilUpdatedAt: BigInt(
            distributor.totalAmountFlowedDistributedUntilUpdatedAt,
          ),
          updatedAtTimestamp: distributor.updatedAtTimestamp,
          flowRate: BigInt(distributor.flowRate),
        };
      }
    }

    return null;
  }, [address, matchingPool]);

  const totalDistributedUser = useFlowingAmount(
    userDistributionInfo?.totalDistributedUserUntilUpdatedAt ?? BigInt(0),
    userDistributionInfo?.updatedAtTimestamp ?? 0,
    userDistributionInfo?.flowRate ?? BigInt(0),
  );
  const totalDistributedAll = useFlowingAmount(
    BigInt(
      matchingPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? BigInt(0),
    ),
    matchingPool?.updatedAtTimestamp ?? 0,
    BigInt(matchingPool?.flowRate ?? 0),
  );

  return (
    <Stack direction="vertical" className="bg-lace-100 rounded-4 mt-8 p-4">
      <Stack direction="horizontal" gap={2} className="align-items-start">
        <Image
          src="/logo-blue.svg"
          alt="SQF"
          width={96}
          height={96}
          className="ms-2 rounded-4"
        />
        <Card className="bg-transparent border-0 ms-2">
          <Card.Title className="fs-lg fw-semi-bold text-secondary">
            {poolName}
          </Card.Title>
        </Card>
      </Stack>
      <Stack direction="horizontal" gap={1} className="p-2 pb-0 mt-4">
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">You</Card.Text>
          <Badge className="bg-primary rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(
              Number(
                formatEther(
                  BigInt(userDistributionInfo?.flowRate ?? 0) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">Others</Card.Text>
          <Badge className="bg-info rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(
              Number(
                formatEther(
                  (BigInt(matchingPool?.flowRate ?? 0) -
                    BigInt(userDistributionInfo?.flowRate ?? 0)) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">All</Card.Text>
          <Badge className="bg-secondary rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(
              Number(
                formatEther(
                  BigInt(matchingPool?.flowRate ?? 0) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20 mt-4">
          monthly
        </Card.Text>
      </Stack>
      <Stack direction="horizontal" gap={1} className="p-2 mb-2">
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-primary rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(Number(formatEther(totalDistributedUser)))}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-info rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(
              Number(formatEther(totalDistributedAll - totalDistributedUser)),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-secondary rounded-2 py-2 text-start fw-semi-bold">
            {formatNumber(Number(formatEther(totalDistributedAll)))}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20">
          total
        </Card.Text>
      </Stack>
      {readMore || noClamp ? (
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
            {description}
          </Markdown>
        </div>
      ) : (
        <Card.Text
          ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
          className="m-0 p-2"
          style={{ maxWidth: 500 }}
        >
          {clampedText}
        </Card.Text>
      )}
      {!noClamp && (
        <Button
          variant="transparent"
          className="mt-4 p-0 border-0 shadow-none"
          onClick={() => setReadMore(!readMore)}
        >
          <Image
            src={readMore ? "/expand-less.svg" : "/expand-more.svg"}
            alt="expand"
            width={18}
          />
        </Button>
      )}
    </Stack>
  );
}
