import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import { Step } from "@/types/checkout";

export type SuccessProps = {
  step: Step;
  isFundingMatchingPool: boolean;
  granteeName?: string;
  granteeTwitter?: string;
  poolName: string;
  poolUiLink: string;
  framesLink?: string;
  newFlowRate: string;
};

export default function Success(props: SuccessProps) {
  const {
    step,
    isFundingMatchingPool,
    granteeName,
    granteeTwitter,
    poolName,
    poolUiLink,
    framesLink,
    newFlowRate,
  } = props;

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
          Help spread the word about Streaming Quadratic Funding by sharing your
          contribution with your network:
        </Card.Text>
        <Stack direction="horizontal" className="justify-content-around">
          <Card.Link
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20donation%20stream%20to%20${
              isFundingMatchingPool
                ? "the matching pool"
                : granteeTwitter
                  ? granteeTwitter
                  : granteeName
            }%20in%20the%20${poolName}%20%23streamingqf%20round.%20Support%20public%20goods%20by%20opening%20your%20stream%20with%20a%20real-time%20matching%20multiplier%20here%3A%20${encodeURIComponent(poolUiLink)}`}
            data-size="large"
          >
            <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            <span style={{ fontSize: "10px" }}>Post to X</span>
          </Card.Link>
          <Card.Link
            className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://warpcast.com/~/compose?text=I+just+opened+a+donation+stream+to+${isFundingMatchingPool ? "the matching pool" : granteeName}+in+the+${poolName}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+${isFundingMatchingPool ? "here" : "this+frame"}%3A+%0A%0A${isFundingMatchingPool ? encodeURIComponent(poolUiLink) : encodeURIComponent(framesLink ?? "")}`}
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
            href={`https://hey.xyz/?text=I+just+opened+a+donation+stream+to+${isFundingMatchingPool ? "the matching pool" : granteeName}+in+the+${poolName}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+${isFundingMatchingPool ? "here" : "this+frame"}%3A+%0A%0A${isFundingMatchingPool ? encodeURIComponent(poolUiLink) : encodeURIComponent(framesLink ?? "")}`}
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
