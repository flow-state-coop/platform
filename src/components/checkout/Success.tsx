import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import { Step } from "@/types/checkout";

export type SuccessProps = {
  step: Step;
  isFundingMatchingPool?: boolean;
  isFundingFlowStateCore?: boolean;
  isFundingFlowSplitter?: boolean;
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
    isFundingFlowStateCore,
    isFundingFlowSplitter,
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
          Help spread the word about{" "}
          {isFundingFlowSplitter
            ? "Streaming Funding"
            : "Streaming Quadratic Funding"}{" "}
          by sharing your contribution with your network:
        </Card.Text>
        <Stack direction="horizontal" className="justify-content-around">
          <Card.Link
            className="d-flex flex-column align-items-center twitter-share-button fs-6 m-0 w-50 text-decoration-none"
            rel="noreferrer"
            target="_blank"
            href={
              isFundingFlowStateCore
                ? `https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20stream%20to%20the%20%40flowstatecoop%20Core%20team%20on%20Flow%20State.%0AJoin%20me%20in%20supporting%20these%20public%20goods%20builders%20at%20${encodeURIComponent(poolUiLink)}`
                : isFundingFlowSplitter
                  ? `https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20stream%20to%20%40ai16z%20on%20Flow%20State.%0AJoin%20me%20in%20supporting%20these%20public%20goods%20builders%20at%20${encodeURIComponent(poolUiLink)}`
                  : `https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20donation%20stream%20to%20${
                      isFundingMatchingPool
                        ? "the matching pool"
                        : granteeTwitter
                          ? granteeTwitter
                          : granteeName
                    }%20in%20the%20${poolName}%20%23streamingqf%20round.%20Join%20me%20here%3A%20${encodeURIComponent(poolUiLink)}&url=https://x.com/flowstatecoop/status/1849499540988231817`
            }
            data-size="large"
          >
            <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            <span style={{ fontSize: "10px" }}>Post to X</span>
          </Card.Link>
          <Card.Link
            className="d-flex flex-column align-items-center fs-6 m-0 w-50 text-decoration-none"
            rel="noreferrer"
            target="_blank"
            href={
              isFundingFlowStateCore
                ? `https://warpcast.com/~/compose?text=I+just+opened+a+stream+to+the+%40flowstatecoop+Core+team+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at&embeds[]=${encodeURIComponent(poolUiLink)}`
                : isFundingFlowSplitter
                  ? `https://warpcast.com/~/compose?text=I+just+opened+a+stream+to+%40ai16z+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at&embeds[]=${encodeURIComponent(poolUiLink)}`
                  : `https://warpcast.com/~/compose?text=I+just+opened+a+donation+stream+to+${isFundingMatchingPool ? "the matching pool" : granteeName}+in+the+${poolName}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+${isFundingMatchingPool ? "here" : "this+frame"}%3A&embeds[]=${isFundingMatchingPool ? encodeURIComponent(poolUiLink) : encodeURIComponent(framesLink ?? "")}`
            }
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
            className="d-flex flex-column align-items-center fs-6 m-0 w-50 text-decoration-none"
            rel="noreferrer"
            target="_blank"
            href={
              isFundingFlowStateCore
                ? `https://hey.xyz/?text=I+just+opened+a+stream+to+the+%40flowstatecoop+Core+team+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at+${encodeURIComponent(poolUiLink)}`
                : isFundingFlowSplitter
                  ? `https://hey.xyz/?text=I+just+opened+a+stream+to+the+%40ai16z+on+Flow+State.%0AJoin+me+in+supporting+these+public+goods+builders+at+${encodeURIComponent(poolUiLink)}`
                  : `https://hey.xyz/?text=I+just+opened+a+donation+stream+to+${isFundingMatchingPool ? "the matching pool" : granteeName}+in+the+${poolName}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+${isFundingMatchingPool ? "here" : "this+frame"}%3A+%0A%0A${isFundingMatchingPool ? encodeURIComponent(poolUiLink) : encodeURIComponent(framesLink ?? "")}`
            }
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
