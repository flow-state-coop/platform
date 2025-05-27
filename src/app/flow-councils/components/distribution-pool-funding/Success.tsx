import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import { Step } from "../../types/distributionPoolFunding";

export type SuccessProps = {
  step: Step;
  councilName: string;
  councilUiLink: string;
  newFlowRate: string;
};

export default function Success(props: SuccessProps) {
  const { step, councilName, councilUiLink, newFlowRate } = props;

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
          <Card.Link
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20stream%20to%20the%20${councilName}%20distribution%20pool%20on%20Flow%20State.%0AJoin%20me%20in%20supporting%20these%20public%20goods%20builders%20at%20${encodeURIComponent(councilUiLink)}`}
            data-size="large"
          >
            <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            <span style={{ fontSize: "10px" }}>Post to X</span>
          </Card.Link>
          <Card.Link
            className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://farcaster.xyz/~/compose?text=I+just+opened+a+stream+to+the+${councilName}+distribution+pool+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at&embeds[]=${encodeURIComponent(councilUiLink)}`}
          >
            <Image
              src="/farcaster.svg"
              alt="farcaster"
              width={28}
              height={22}
            />
            <span style={{ fontSize: "10px" }}>Cast to Farcaster</span>
          </Card.Link>
          <Card.Link
            className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://hey.xyz/?text=I+just+opened+a+stream+to+the+${councilName}+distribution+pool+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at+${encodeURIComponent(councilUiLink)}`}
          >
            <Image src="/lens.svg" alt="lens" width={28} height={22} />
            <span style={{ fontSize: "10px" }}>Post on Lens</span>
          </Card.Link>
        </Stack>
      </Card>
    );
  }

  return null;
}
