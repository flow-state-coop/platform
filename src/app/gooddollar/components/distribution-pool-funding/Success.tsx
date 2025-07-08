import { useAccount } from "wagmi";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import { SupEvent } from "@/app/api/flow-council/db";
import { Step } from "@/app/flow-councils/types/distributionPoolFunding";

export type SuccessProps = {
  step: Step;
  councilName: string;
  chainId: number;
  councilUiLink: string;
  newFlowRate: string;
};

export default function Success(props: SuccessProps) {
  const { step, chainId, councilUiLink, newFlowRate } = props;

  const { address } = useAccount();

  const sendSupEvent = (event: SupEvent) => {
    fetch("/api/good-dollar/sup", {
      method: "POST",
      body: JSON.stringify({
        address,
        chainId,
        event,
      }),
    });
  };

  if (step === Step.SUCCESS && BigInt(newFlowRate) === BigInt(0)) {
    return (
      <Card className="bg-light mt-4 p-4 rounded-4 border-0">
        <Card.Text>Your donation stream is closed.</Card.Text>
      </Card>
    );
  } else if (step === Step.SUCCESS) {
    return (
      <Card className="bg-light mt-4 p-4 rounded-4 border-0">
        <Card.Text>
          Your donation stream is open.{" "}
          <Card.Link href="https://claim.superfluid.org/" target="_blank">
            Claim your $SUP rewards
          </Card.Link>{" "}
          daily (after 00:30 UTC) for as long as you keep your stream open.
        </Card.Text>
        <Card.Text as="span" className="text-center" style={{ fontSize: 100 }}>
          &#x1F64F;
        </Card.Text>
        <Card.Text>
          Share the GoodBuilders Round to earn a $SUP bonus:
        </Card.Text>
        <Stack direction="horizontal" className="justify-content-around">
          <Button
            variant="transparent"
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={() => sendSupEvent("shared-distribution")}
          >
            <Card.Link
              rel="noreferrer"
              target="_blank"
              href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20donation%20stream%20to%20the%20%40gooddollarorg%20Flow%20Council%20on%20%40flowstatecoop.%20Stream%20G%24%20and%20earn%20your%20share%20of%201M%20%24SUP%20from%20%40Superfluid_HQ%3A%20${encodeURIComponent(councilUiLink)}&url=https://x.com/gooddollarorg/status/1936092432061362416`}
              data-size="large"
            >
              <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            </Card.Link>
            <span style={{ fontSize: "10px" }}>Post to X</span>
          </Button>
          <Button
            variant="transparent"
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={() => sendSupEvent("shared-distribution")}
          >
            <Card.Link
              rel="noreferrer"
              target="_blank"
              href={`https://farcaster.xyz/~/compose?text=I%20just%20opened%20a%20donation%20stream%20to%20the%20%40gooddollar%20Flow%20Council%20on%20%40flowstatecoop.%20Stream%20G%24%20and%20earn%20your%20share%20of%201M%20%24SUP%20from%20%40superfluid%3A%20&embeds[]=${councilUiLink}`}
            >
              <Image
                src="/farcaster.svg"
                alt="farcaster"
                width={28}
                height={22}
              />
            </Card.Link>
            <span style={{ fontSize: "10px" }}>Cast to Farcaster</span>
          </Button>
          <Button
            variant="transparent"
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={() => sendSupEvent("shared-distribution")}
          >
            <Card.Link
              rel="noreferrer"
              target="_blank"
              href={`https://hey.xyz/?text=I%20just%20voted%20in%20the%20GoodBuilders%20Flow%20Council%20on%20%40flowstatecoop.%20Join%20me%20%26%20earn%20your%20share%20of%201M%20%24SUP%20from%20%40superfluid%3A%20${encodeURIComponent(councilUiLink)}`}
            >
              <Image src="/lens.svg" alt="lens" width={28} height={22} />
            </Card.Link>
            <span style={{ fontSize: "10px" }}>Post on Lens</span>
          </Button>
        </Stack>
      </Card>
    );
  }

  return null;
}
