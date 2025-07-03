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
  const { step, councilName, chainId, councilUiLink, newFlowRate } = props;

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
          Your donation stream is open. Thank you for supporting public goods!
        </Card.Text>
        <Card.Text as="span" className="text-center" style={{ fontSize: 100 }}>
          &#x1F64F;
        </Card.Text>
        <Card.Text>
          Help spread the word about Flow State by sharing your contribution
          with your network:
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
              href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20stream%20to%20the%20${councilName}%20distribution%20pool%20on%20Flow%20State.%0A%0AI%27m%20earning%20%40Superfluid_HQ%20%24SUP%20every%20second%20for%20supporting%20public%20goods.%0A%0AYou%20can%20too%20%F0%9F%91%87%3A%20${encodeURIComponent(councilUiLink)}&url=https://x.com/flowstatecoop/status/1909243251246104641`}
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
              href={`https://farcaster.xyz/~/compose?text=I%just%20opened%20a%20stream%20to%20the%20GoodBuilders%20Program%20Round%202distribution%20pool%20on%20%40flowstatecoop.%0A%0AI%27m%20earning%20%40Superfluid_HQ%20%24SUP%20every%20second%20for%20supporting%20public%20goods.%0A%0AYou%20can%20too%20%F0%9F%91%87%3A%20&embeds[]=https://farcaster.xyz/flowstatecoop/0x87385e01&embeds[]=${councilUiLink}`}
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
              href={`https://hey.xyz/?text=I%20just%20opened%20a%20stream%20to%20the%20${councilName}%20distribution%20pool%20on%20Flow%20State.%0A%0AI%27m%20earning%20%40Superfluid_HQ%20%24SUP%20every%20second%20for%20supporting%20public%20goods.%0A%0AYou%20can%20too%20%F0%9F%91%87%3A%20${encodeURIComponent(councilUiLink)}`}
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
