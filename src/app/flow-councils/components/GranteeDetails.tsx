import { useState, useEffect } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import useCouncil from "../hooks/council";
import { ProjectMetadata } from "@/types/project";

type GranteeDetails = {
  id: string;
  metadata: ProjectMetadata;
  placeholderLogo: string;
  granteeAddress: `0x${string}`;
  chainId: number;
  hide: () => void;
};

export default function GranteeDetails(props: GranteeDetails) {
  const { id, metadata, placeholderLogo, granteeAddress, chainId, hide } =
    props;

  const [imageUrl, setImageUrl] = useState("");

  const { dispatchNewAllocation } = useCouncil();

  useEffect(() => {
    (async () => {
      if (metadata.logoImg) {
        const imageUrl = await fetchIpfsImage(metadata.logoImg);

        setImageUrl(imageUrl);
      }
    })();
  }, [metadata.logoImg]);

  return (
    <Offcanvas show onHide={hide} placement="end">
      <Offcanvas.Header closeButton className="pb-0">
        <Offcanvas.Title className="fs-3">Recipient Details</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack direction="vertical" className="bg-light rounded-4 p-2 pt-0">
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
              <Card.Title className="fs-6 text-secondary">
                {metadata.title}
              </Card.Title>
            </Card>
          </Stack>
          <Stack
            direction="horizontal"
            gap={1}
            className="align-items-end text-info fs-6 px-2 mb-2"
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
          </Stack>
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
            className="d-flex gap-1 justify-content-center align-items-center px-4"
            onClick={() =>
              dispatchNewAllocation({
                type: "add",
                allocation: {
                  grantee: granteeAddress,
                  amount: 1,
                },
                showBallot: false,
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
          <Button
            variant="link"
            href={`/projects/${id}/?chainId=${chainId}`}
            target="_blank"
            className="d-flex justify-content-center align-items-center gap-2 mt-2 bg-secondary text-light text-decoration-none"
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
            Project Page
          </Button>
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
