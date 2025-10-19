import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import { Step } from "@/types/checkout";

export type SuccessProps = {
  step: Step;
  newFlowRate: string;
  socialShare: { twitter: string; farcaster: string; lens: string };
  onClick?: () => void;
};

export default function Success(props: SuccessProps) {
  const { step, newFlowRate, socialShare, onClick } = props;

  if (step === Step.SUCCESS && BigInt(newFlowRate) === BigInt(0)) {
    return (
      <Card className="bg-lace-100 text-secondary fw-semi-bold mt-4 p-4 rounded-4 border-0">
        <Card.Text>Your donation stream is closed.</Card.Text>
      </Card>
    );
  } else if (step === Step.SUCCESS) {
    return (
      <Card className="bg-lace-100 mt-4 p-4 rounded-4 border-0">
        <Card.Text className="text-secondary fw-semi-bold text-center">
          Your donation stream is open. Thank you for supporting public goods!
        </Card.Text>
        <Card.Text
          as="span"
          className="text-center mb-6"
          style={{ fontSize: 100 }}
        >
          &#x1F64F;
        </Card.Text>
        <Card.Text className="text-center">
          Help spread the word about Streaming Quadratic Funding by sharing your
          contribution with your network:
        </Card.Text>
        <Stack direction="horizontal" className="justify-content-around mt-2">
          <Button
            variant="link"
            href={socialShare.twitter}
            target="_blank"
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={onClick}
          >
            <Image src="/x-logo.svg" alt="x social" width={28} height={22} />
            <span className="fw-semi-bold" style={{ fontSize: "10px" }}>
              Post to X
            </span>
          </Button>
          <Button
            variant="link"
            target="_blank"
            href={socialShare.farcaster}
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={onClick}
          >
            <Image
              src="/farcaster.svg"
              alt="farcaster"
              width={28}
              height={22}
            />
            <span className="fw-semi-bold" style={{ fontSize: "10px" }}>
              Cast to Farcaster
            </span>
          </Button>
          <Button
            variant="link"
            href={socialShare.lens}
            target="_blank"
            className="d-flex flex-column align-items-center twitter-share-button text-decoration-none p-0 fs-6 m-0 w-50"
            onClick={onClick}
          >
            <Image src="/lens.svg" alt="lens" width={28} height={22} />
            <span className="fw-semi-bold" style={{ fontSize: "10px" }}>
              Post on Lens
            </span>
          </Button>
        </Stack>
      </Card>
    );
  }

  return null;
}
