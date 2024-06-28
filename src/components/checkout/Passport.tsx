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
};

export default function Passport(props: PassportProps) {
  const {
    step,
    setStep,
    passportScore,
    minPassportScore,
    setShowMintingInstructions,
    refetchPassportScore,
  } = props;

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-secondary">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 border-0 rounded-0 shadow-none"
        style={{
          pointerEvents: step !== Step.REVIEW ? "none" : "auto",
        }}
        onClick={() => setStep(Step.MINT_PASSPORT)}
      >
        <Badge
          pill
          className={`d-flex justify-content-center p-0 ${
            step !== Step.MINT_PASSPORT &&
            step !== Step.REVIEW &&
            step !== Step.SUCCESS
              ? "bg-dark"
              : step === Step.REVIEW || step === Step.SUCCESS
                ? "bg-secondary"
                : "bg-info"
          }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {step === Step.REVIEW || step === Step.SUCCESS ? (
            <Image
              src="/success.svg"
              alt="done"
              width={16}
              height={16}
              className="m-auto"
            />
          ) : (
            <Card.Text className="m-auto text-white">4</Card.Text>
          )}
        </Badge>
        {Step.MINT_PASSPORT}
      </Button>
      <Accordion.Collapse eventKey={Step.MINT_PASSPORT} className="p-3 py-0">
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
                  : "text-yellow"
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
                      ? "invert(65%) sepia(44%) saturate(6263%) hue-rotate(103deg) brightness(95%) contrast(97%)"
                      : passportScore
                        ? "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)"
                        : "invert(88%) sepia(26%) saturate(4705%) hue-rotate(2deg) brightness(109%) contrast(102%)",
                }}
              />
            </Button>
          </Stack>
          <Button
            variant="secondary"
            className="w-100 rounded-3"
            onClick={() => setShowMintingInstructions(true)}
          >
            Update stamps and mint
          </Button>
          <Button
            variant="success"
            disabled={!passportScore || passportScore < minPassportScore}
            className="w-100 m-0 ms-auto mt-1 fs-5 text-white fw-bold"
            onClick={() => setStep(Step.REVIEW)}
          >
            Continue
          </Button>
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
