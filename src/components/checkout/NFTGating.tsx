import { Address } from "viem";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import { Step } from "@/types/checkout";
import { Network } from "@/types/network";
import { truncateStr } from "@/lib/utils";

export type NFTGatingProps = {
  step: Step;
  setStep: (step: Step) => void;
  network?: Network;
  requiredNftAddress: Address;
  isEligible: boolean;
  nftMintUrl: string | null;
  isPureSuperToken: boolean;
};

export default function NFTGating(props: NFTGatingProps) {
  const {
    step,
    setStep,
    network,
    requiredNftAddress,
    isEligible,
    nftMintUrl,
    isPureSuperToken,
  } = props;

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-info">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 border-0 rounded-0 shadow-none"
        style={{
          pointerEvents:
            step !== Step.SUPPORT && step !== Step.REVIEW ? "none" : "auto",
        }}
        onClick={() => setStep(Step.ELIGIBILITY)}
      >
        <Badge
          pill
          className={`d-flex justify-content-center p-0 ${
            step !== Step.ELIGIBILITY &&
            step !== Step.SUPPORT &&
            step !== Step.REVIEW &&
            step !== Step.SUCCESS
              ? "bg-secondary"
              : step === Step.SUPPORT ||
                  step === Step.REVIEW ||
                  step === Step.SUCCESS
                ? "bg-info"
                : "bg-primary"
          }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {step === Step.SUPPORT ||
          step === Step.REVIEW ||
          step === Step.SUCCESS ? (
            <Image
              src="/success.svg"
              alt="done"
              width={16}
              height={16}
              className="m-auto"
            />
          ) : (
            <Card.Text
              className="m-auto text-light"
              style={{ fontFamily: "Helvetica" }}
            >
              {isPureSuperToken ? 3 : 4}
            </Card.Text>
          )}
        </Badge>
        {Step.ELIGIBILITY}
      </Button>
      <Accordion.Collapse eventKey={Step.ELIGIBILITY} className="p-3 py-0">
        <Stack direction="vertical" gap={2}>
          <Card.Text className="m-0 border-bottom border-gray">
            Matching Eligibility
          </Card.Text>
          <Stack
            direction="horizontal"
            gap={3}
            className="justify-content-between mb-4"
          >
            <Stack direction="vertical" gap={2} className="align-items-center">
              <Image
                src={isEligible ? "/success.svg" : "close.svg"}
                alt={isEligible ? "success" : "fail"}
                width={48}
                height={48}
                style={{
                  filter: isEligible
                    ? "invert(40%) sepia(14%) saturate(2723%) hue-rotate(103deg) brightness(97%) contrast(80%)"
                    : "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)",
                }}
              />
              <Card.Text
                className={`m-0 ${isEligible ? "text-success" : "text-danger"}`}
              >
                {isEligible ? "Eligibile" : "Ineligible"}
              </Card.Text>
            </Stack>
            <Stack
              direction="vertical"
              className="align-items-center justify-content-center m-auto"
            >
              NFT Required:
              <Stack direction="horizontal" gap={2} className="m-auto mt-0">
                <Card.Text className="m-0">
                  {truncateStr(requiredNftAddress, 12)}
                </Card.Text>
                <Button
                  variant="link"
                  href={`${network?.blockExplorer}/address/${requiredNftAddress}`}
                  target="_blank"
                  className="d-flex align-items-center p-0"
                >
                  <Image src="open-new.svg" alt="open" width={18} height={18} />
                </Button>
              </Stack>
            </Stack>
          </Stack>
          {nftMintUrl ? (
            <Button
              variant="link"
              href={nftMintUrl}
              target="_blank"
              disabled={isEligible}
              className="bg-secondary text-light text-decoration-none"
            >
              Claim NFT
            </Button>
          ) : !isEligible ? (
            <Card.Text className="m-0">
              Double check the wallet you're using or reach out to the pool
              admins if you think you should be eligible.
            </Card.Text>
          ) : null}
          <Button
            disabled={!isEligible}
            className="w-100 m-0 ms-auto mt-1 mb-3 text-light fw-bold"
            onClick={() =>
              setStep(
                !sessionStorage.getItem("skipSupportFlowState") &&
                  !localStorage.getItem("skipSupportFlowState")
                  ? Step.SUPPORT
                  : Step.REVIEW,
              )
            }
          >
            Continue
          </Button>
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
