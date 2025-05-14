import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import CopyTooltip from "@/components/CopyTooltip";

export default function ProjectDetails() {
  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";
  const roundUiLink = `${hostName}/core`;

  return (
    <Stack direction="vertical" className="bg-light rounded-4 p-2">
      <Stack direction="vertical" className="bg-light rounded-4 p-2">
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Image
            src="/logo.png"
            alt="logo"
            width={96}
            height={96}
            className="ms-2 rounded-4"
          />
          <Card.Text className="fs-4 bg-transparent border-0 ms-2">
            Flow State
          </Card.Text>
        </Stack>
        <Stack
          direction="horizontal"
          gap={1}
          className="align-items-end text-info fs-6"
        >
          <Button
            variant="link"
            href="https://flowstate.network/core"
            target="_blank"
            className="ms-1 p-0"
          >
            <Image src="/web.svg" alt="Web" width={18} height={18} />
          </Button>
          <Button
            variant="link"
            href={`https://github.com/flow-state-coop`}
            target="_blank"
            className="ms-1 p-0"
          >
            <Image src="/github.svg" alt="Github" width={18} height={18} />
          </Button>
          <Button
            variant="link"
            href={`https://x.com/flowstatecoop`}
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
          <Button
            variant="link"
            href={`https://warpcast.com/flowstatecoop`}
            target="_blank"
            className="p-0"
          >
            <Image src="/warpcast.svg" alt="Warpcast" width={16} height={16} />
          </Button>
          <Button
            variant="link"
            href={`https://t.me/flowstatecoop`}
            target="_blank"
            className="p-0"
          >
            <Image src="/telegram.svg" alt="telegram" width={18} height={18} />
          </Button>
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
        <Card.Text className="mt-3 mb-1 fs-6">
          Flow State builds programmable money streaming tools for public goods
          and their builders.
          <br />
          <br />
          Open a stream or send a one-time donation, so we can stay focused on
          creating impact. All streaming donations are eligible for{" "}
          <Card.Link href="https://claim.superfluid.org/claim" target="_blank">
            Superfluid SUP token rewards!
          </Card.Link>{" "}
        </Card.Text>
      </Stack>
    </Stack>
  );
}
