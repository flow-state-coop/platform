import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import { Step } from "@/types/checkout";

export type SuccessProps = {
  step: Step;
  isFundingMatchingPool: boolean;
  matchingPoolName?: string;
  granteeName?: string;
  granteeTwitter?: string;
  newFlowRate: string;
};

export default function Success(props: SuccessProps) {
  const {
    step,
    isFundingMatchingPool,
    matchingPoolName,
    granteeName,
    granteeTwitter,
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
            href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20contribution%20stream%20to%20${
              isFundingMatchingPool && matchingPoolName
                ? matchingPoolName
                : granteeTwitter
                  ? granteeTwitter
                  : ""
            }%20in%20the%20%23streamingqf%20pilot%20presented%20by%20%40thegeoweb%2C%20%40Superfluid_HQ%2C%20%26%20%40gitcoin%3A%0A%0Ahttps%3A%2F%2Fstreaming.fund%0A%0AJoin%20me%20in%20making%20public%20goods%20funding%20history%20by%20donating%20in%20the%20world%27s%20first%20SQF%20round%21`}
            data-size="large"
          >
            <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            <span style={{ fontSize: "10px" }}>Post to X</span>
          </Card.Link>
          <Card.Link
            className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
            rel="noreferrer"
            target="_blank"
            href={`https://warpcast.com/~/compose?text=I+just+opened+a+contribution+stream+to+${
              isFundingMatchingPool && matchingPoolName
                ? matchingPoolName
                : granteeName
            }+in+the+%23streamingqf+pilot+round+presented+by+%40geoweb%2C+%40gitcoin%2C+%26+%40superfluid%3A+%0A%0Ahttps%3A%2F%2Fstreaming.fund+%0A%0AJoin+me+in+making+public+goods+funding+history+by+donating+in+the+world's+first+SQF+round%21`}
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
            href={`https://hey.xyz/?text=I+just+opened+a+contribution+stream+to+${
              isFundingMatchingPool && matchingPoolName
                ? matchingPoolName
                : granteeName
            }+in+the+%23streamingqf+pilot+round+presented+by+Geo+Web%2C+%40gitcoin%2C+%26+%40superfluid%3A+%0A%0Ahttps%3A%2F%2Fstreaming.fund+%0A%0AJoin+me+in+making+public+goods+funding+history+by+donating+in+the+world%27s+first+SQF+round%21`}
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
