import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import { Step } from "@/types/checkout";

export type PassportProps = {
  step: Step;
  setStep: (step: Step) => void;
  passportScore?: number;
  minPassportScore: number;
  setShowMintingInstructions: (show: boolean) => void;
  refetchPassportScore: (args: { throwOnError: boolean }) => void;
  isPureSuperToken: boolean;
};

export default function Passport(props: PassportProps) {
  const {
    step,
    setStep,
    passportScore,
    minPassportScore,
    setShowMintingInstructions,
    refetchPassportScore,
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
        Mint Gitcoin Passport
      </Button>
      <Accordion.Collapse eventKey={Step.ELIGIBILITY} className="p-3 py-0">
        <Stack direction="vertical" gap={2}>
          <Card.Text className="m-0 border-bottom border-gray">
            Current Score
          </Card.Text>
          <Stack
            direction="horizontal"
            gap={3}
            className={`${
              passportScore && passportScore > minPassportScore
                ? "text-success"
                : passportScore
                  ? "text-danger"
                  : "text-warning"
            }`}
          >
            <Image src="/passport.svg" alt="passport" width={36} height={36} />
            <Card.Text className="m-0 fs-2 fw-bold">
              {passportScore ? parseFloat(passportScore.toFixed(3)) : "N/A"}
            </Card.Text>
            <Card.Text className="m-0 fs-6" style={{ width: 80 }}>
              min. {minPassportScore} required for matching
            </Card.Text>
            <Button
              variant="transparent"
              className="p-0"
              onClick={() => refetchPassportScore({ throwOnError: false })}
            >
              <Image
                src="/reload.svg"
                alt="reload"
                width={24}
                height={24}
                style={{
                  filter:
                    passportScore && passportScore > minPassportScore
                      ? "invert(40%) sepia(14%) saturate(2723%) hue-rotate(103deg) brightness(97%) contrast(80%)"
                      : passportScore
                        ? "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)"
                        : "invert(86%) sepia(44%) saturate(4756%) hue-rotate(353deg) brightness(109%) contrast(103%)",
                }}
              />
            </Button>
          </Stack>
          <Button
            variant="secondary"
            className="w-100 rounded-3 text-light"
            onClick={() => setShowMintingInstructions(true)}
          >
            Update stamps and mint
          </Button>
          <Button
            disabled={!passportScore || passportScore < minPassportScore}
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
