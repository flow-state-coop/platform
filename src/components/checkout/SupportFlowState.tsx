import { useAccount } from "wagmi";
import dayjs from "dayjs";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import FormControl from "react-bootstrap/FormControl";
import FormCheck from "react-bootstrap/FormCheck";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Alert from "react-bootstrap/Alert";
import { Step } from "@/types/checkout";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { getSupportFlowStateConfig } from "@/lib/supportFlowStateConfig";
import { useMediaQuery } from "@/hooks/mediaQuery";
import {
  fromTimeUnitsToSeconds,
  unitOfTime,
  TimeInterval,
  roundWeiAmount,
  formatNumber,
  formatNumberWithCommas,
  isNumber,
} from "@/lib/utils";

export type SupportFlowStateProps = {
  network?: Network;
  token: Token;
  step: Step;
  setStep: (step: Step) => void;
  supportFlowStateAmount: string;
  setSupportFlowStateAmount: (amount: string) => void;
  flowRateToFlowState: string;
  newFlowRateToFlowState: string;
  isFundingDistributionPool?: boolean;
  isSuperTokenPure: boolean;
};

dayjs().format();

export default function SupportFlowState(props: SupportFlowStateProps) {
  const {
    network,
    token,
    step,
    setStep,
    supportFlowStateAmount,
    setSupportFlowStateAmount,
    flowRateToFlowState,
    newFlowRateToFlowState,
    isFundingDistributionPool,
    isSuperTokenPure,
  } = props;

  const { address } = useAccount();
  const { isMobile } = useMediaQuery();

  const isNativeSuperToken =
    token.symbol === "ETHx" || token.symbol === "CELOx";
  const isDeletingStream =
    BigInt(flowRateToFlowState) > 0 &&
    BigInt(newFlowRateToFlowState) === BigInt(0);
  const supportFlowStateConfig = getSupportFlowStateConfig(token.symbol);
  const minDonationPerMonth = supportFlowStateConfig.minAllocationPerMonth;
  const suggestedDonation = supportFlowStateConfig.suggestedFlowStateDonation;

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const valueWithoutCommas = value.replace(/,/g, "");

    if (isNumber(valueWithoutCommas)) {
      setSupportFlowStateAmount(
        `${
          isNativeSuperToken && parseFloat(valueWithoutCommas) < 1000
            ? value
            : formatNumberWithCommas(valueWithoutCommas)
        }`,
      );
    } else if (value === "") {
      setSupportFlowStateAmount("");
    } else if (value === ".") {
      setSupportFlowStateAmount(isNativeSuperToken ? "0." : "0");
    }
  };

  return (
    <Card className="bg-lace-100 rounded-0 border-0 border-bottom border-white">
      <Button
        variant="transparent"
        className="d-flex gap-3 p-4 border-0 rounded-0 shadow-none text-secondary fs-lg fw-semi-bold"
        style={{
          pointerEvents: step === Step.REVIEW ? "auto" : "none",
        }}
        onClick={() => setStep(Step.SUPPORT)}
      >
        <Badge
          pill
          className={`d-flex justify-content-center p-0 ${
            step !== Step.SUPPORT &&
            step !== Step.REVIEW &&
            step !== Step.SUCCESS
              ? "bg-secondary"
              : step === Step.REVIEW || step === Step.SUCCESS
                ? "bg-info"
                : "bg-primary"
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
            <Card.Text
              className="m-auto text-light"
              style={{ fontFamily: "Helvetica" }}
            >
              {isFundingDistributionPool && isSuperTokenPure
                ? 3
                : isFundingDistributionPool || isSuperTokenPure
                  ? 4
                  : 5}
            </Card.Text>
          )}
        </Badge>
        {Step.SUPPORT}
      </Button>
      <Accordion.Collapse eventKey={Step.SUPPORT} className="p-3 pt-0">
        <>
          <Card.Text className="mb-4 lh-sm small">
            Flow State offers this platform as a public good.
            <br />
            <br />
            {BigInt(flowRateToFlowState) > 0 ? (
              <>
                Thank you for being a supporter! Since you're back again... do
                you want to help spin the public goods flywheel faster?
              </>
            ) : (
              <>
                Can you help us keep the public goods flywheel spinning with a
                donation below?
              </>
            )}
          </Card.Text>
          <Stack direction="horizontal" gap={2}>
            <Badge className="d-flex align-items-center gap-2 bg-white text-dark w-50 rounded-4 px-3 py-4 fs-lg fw-semi-bold">
              <Image
                src={network?.icon ?? "/eth.png"}
                alt="token"
                width={20}
                height={20}
              />
              {network?.name ?? "N/A"}
            </Badge>
            <Badge className="d-flex align-items-center gap-2 bg-white text-dark w-50 rounded-4 px-3 py-4 fs-lg fw-semi-bold">
              <Image
                src={token.icon ?? "/eth.png"}
                alt="token"
                width={20}
                height={20}
              />
              {token.symbol}
            </Badge>
          </Stack>
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-start mt-3"
          >
            <Stack
              direction="vertical"
              gap={1}
              className="position-relative w-50"
            >
              <FormControl
                type="text"
                placeholder="0"
                disabled={!address}
                value={supportFlowStateAmount}
                onChange={handleAmountSelection}
                className="bg-white border-0 rounded-4 py-3 shadow-none fs-lg fw-semi-bold"
              />
              <Card.Text
                className="position-absolute m-0 text-info"
                style={{ top: 8, right: 12, fontSize: "0.6rem" }}
              >
                Current:{" "}
                {formatNumberWithCommas(
                  roundWeiAmount(
                    BigInt(flowRateToFlowState) *
                      BigInt(
                        fromTimeUnitsToSeconds(
                          1,
                          unitOfTime[TimeInterval.MONTH],
                        ),
                      ),
                    4,
                  ),
                )}
              </Card.Text>
              <Stack
                direction="horizontal"
                gap={2}
                className="mt-2 align-items-stretch"
              >
                <Button
                  className="p-0 fw-semi-bold"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      formatNumberWithCommas(
                        (suggestedDonation * 2).toString(),
                      ),
                    )
                  }
                >
                  {formatNumber(suggestedDonation * 2)}
                </Button>
                <Button
                  className="px-0 py-1 fw-semi-bold"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      formatNumberWithCommas(
                        (suggestedDonation * 5).toString(),
                      ),
                    )
                  }
                >
                  {formatNumber(suggestedDonation * 5)}
                </Button>
                <Button
                  className="px-0 py-1 fw-semi-bold"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      formatNumberWithCommas(
                        (suggestedDonation * 10).toString(),
                      ),
                    )
                  }
                >
                  {formatNumber(suggestedDonation * 10)}
                </Button>
              </Stack>
            </Stack>
            <FormControl
              type="text"
              disabled
              value="/month"
              className="w-50 bg-white border-0 rounded-4 py-3 fs-lg fw-semi-bold shadow-none"
            />
          </Stack>
          {Number(supportFlowStateAmount) > 0 &&
            minDonationPerMonth &&
            Number(supportFlowStateAmount) < minDonationPerMonth && (
              <Alert variant="warning" className="mt-2 px-3 py-4 fw-semi-bold">
                Minimum Donation = {minDonationPerMonth} {token.symbol}/mo
              </Alert>
            )}
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between align-items-center mt-6"
          >
            <Button
              variant="transparent"
              className="text-info"
              onClick={() => {
                setSupportFlowStateAmount("");
                setStep(Step.REVIEW);
              }}
            >
              Skip
            </Button>
            <Button
              variant={isDeletingStream ? "danger" : "primary"}
              disabled={
                !supportFlowStateAmount ||
                (!isDeletingStream &&
                  (Number(supportFlowStateAmount) === 0 ||
                    Number(supportFlowStateAmount) < minDonationPerMonth))
              }
              className="w-50 py-4 rounded-4 fw-semi-bold text-light"
              onClick={() => setStep(Step.REVIEW)}
            >
              {isDeletingStream ? "Cancel Stream" : "Continue"}
            </Button>
          </Stack>
          <Stack direction="horizontal" className="justify-content-center mt-3">
            <FormCheck
              label="Don't ask me again"
              className="text-info"
              onChange={(e) => {
                const checked = e.target.checked;

                if (checked) {
                  localStorage.setItem("skipSupportFlowState", "true");
                } else {
                  localStorage.removeItem("skipSupportFlowState");
                }
              }}
            />
          </Stack>
        </>
      </Accordion.Collapse>
    </Card>
  );
}
