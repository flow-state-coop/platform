import { Address } from "viem";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import InfoTooltip from "@/components/InfoTooltip";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import Sankey from "./Sankey";
import { Grantee } from "../pool";
import { Pool } from "@/types/pool";
import { useMediaQuery } from "@/hooks/mediaQuery";

type PoolInfoProps = Pool & {
  grantees: Grantee[];
  chainId: number;
  gdaPoolAddress: Address;
  totalDistributionsCount: number;
  showTransactionPanel: () => void;
};

export default function PoolInfo(props: PoolInfoProps) {
  const {
    name,
    description,
    chainId,
    gdaPoolAddress,
    grantees,
    totalDistributionsCount,
    showTransactionPanel,
  } = props;

  const { isMobile } = useMediaQuery();

  return (
    <div className="px-4 pt-5 pool-info-background">
      <Stack direction="vertical" className="pb-4">
        <Stack direction="horizontal" className="justify-content-between">
          <Stack direction="horizontal" gap={1}>
            <Card.Text className="m-0 fs-4 fw-bold">{name}</Card.Text>
            <InfoTooltip
              content={
                <Markdown
                  className="p-2"
                  skipHtml={true}
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    [
                      rehyperExternalLinks,
                      { target: "_blank", properties: { class: "text-light" } },
                    ],
                  ]}
                >
                  {description}
                </Markdown>
              }
              target={
                <Image
                  src="/info.svg"
                  alt="description"
                  width={20}
                  className="mb-4"
                />
              }
            />
          </Stack>
        </Stack>
        <Card.Text className="mb-4 fs-6">Streaming Quadratic Funding</Card.Text>
        <Sankey
          grantees={grantees}
          chainId={chainId}
          gdaPoolAddress={gdaPoolAddress}
          totalDistributionsCount={totalDistributionsCount}
        />
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          gap={4}
          className="justify-content-end w-100 mt-4"
        >
          <Button
            className="p-2 text-light fs-5"
            style={{ width: isMobile ? "100%" : 180 }}
            onClick={showTransactionPanel}
          >
            Grow the Pie
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}
