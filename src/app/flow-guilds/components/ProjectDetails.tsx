import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import CopyTooltip from "@/components/CopyTooltip";
import { FlowGuildConfig } from "../lib/flowGuildConfig";

type ProjectDetailsProps = {
  flowGuildConfig: FlowGuildConfig;
};

export default function ProjectDetails(props: ProjectDetailsProps) {
  const { flowGuildConfig } = props;

  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";
  const roundUiLink = `${hostName}/flow-guilds/${flowGuildConfig.id}`;

  return (
    <Stack direction="vertical" className="bg-light rounded-4 p-2">
      <Stack direction="vertical" className="bg-light rounded-4 p-2">
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Image
            src={flowGuildConfig.logo}
            alt="logo"
            width={96}
            height={96}
            className="ms-2 rounded-4"
          />
          <Card.Text className="fs-4 bg-transparent border-0 ms-2">
            {flowGuildConfig.name}
          </Card.Text>
        </Stack>
        <Stack
          direction="horizontal"
          gap={1}
          className="align-items-end mt-1 text-info fs-6"
        >
          {!!flowGuildConfig.website && (
            <Button
              variant="link"
              href={flowGuildConfig.website}
              target="_blank"
              className="ms-1 p-0"
            >
              <Image src="/web.svg" alt="Web" width={18} height={18} />
            </Button>
          )}
          {!!flowGuildConfig.github && (
            <Button
              variant="link"
              href={flowGuildConfig.github}
              target="_blank"
              className="ms-1 p-0"
            >
              <Image src="/github.svg" alt="Github" width={18} height={18} />
            </Button>
          )}
          {!!flowGuildConfig.twitter && (
            <Button
              variant="link"
              href={flowGuildConfig.twitter}
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
          {!!flowGuildConfig.farcaster && (
            <Button
              variant="link"
              href={flowGuildConfig.farcaster}
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
          {!!flowGuildConfig.telegram && (
            <Button
              variant="link"
              href={flowGuildConfig.telegram}
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
          {!!flowGuildConfig.discord && (
            <Button
              variant="link"
              href={flowGuildConfig.discord}
              target="_blank"
              className="p-0"
            >
              <Image src="/discord.svg" alt="discord" width={18} height={18} />
            </Button>
          )}
          <CopyTooltip
            contentClick="Link copied"
            contentHover="Copy link"
            handleCopy={() => navigator.clipboard.writeText(roundUiLink)}
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
        {!!flowGuildConfig.description && (
          <Markdown
            className="mt-3 mb-1 fs-6"
            skipHtml={true}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehyperExternalLinks, { target: "_blank" }]]}
            components={{
              table: (props) => (
                <table className="table table-striped" {...props} />
              ),
            }}
          >
            {flowGuildConfig.description}
          </Markdown>
        )}
      </Stack>
    </Stack>
  );
}
