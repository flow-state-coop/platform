import { useAccount } from "wagmi";
import { parseEther } from "viem";
import dayjs from "dayjs";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import FormControl from "react-bootstrap/FormControl";
import FormCheck from "react-bootstrap/FormCheck";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Alert from "react-bootstrap/Alert";
import { Step } from "@/types/checkout";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { useMediaQuery } from "@/hooks/mediaQuery";
import {
  fromTimeUnitsToSeconds,
  unitOfTime,
  TimeInterval,
  convertStreamValueToInterval,
  roundWeiAmount,
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
  supportFlowStateTimeInterval: TimeInterval;
  setSupportFlowStateTimeInterval: (timeInterval: TimeInterval) => void;
  flowRateToFlowState: string;
  newFlowRateToFlowState: string;
  isFundingMatchingPool: boolean;
  isPureSuperToken: boolean;
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
    supportFlowStateTimeInterval,
    setSupportFlowStateTimeInterval,
    flowRateToFlowState,
    newFlowRateToFlowState,
    isFundingMatchingPool,
    isPureSuperToken,
  } = props;

  const { address } = useAccount();
  const { isMobile } = useMediaQuery();

  const isNativeSuperToken = token.name === "ETHx";
  const isDeletingStream =
    BigInt(flowRateToFlowState) > 0 &&
    BigInt(newFlowRateToFlowState) === BigInt(0);
  const poolFlowRateConfig = getPoolFlowRateConfig(token.name);
  const minDonationPerMonth = poolFlowRateConfig.minAllocationPerMonth;
  const suggestedDonation = poolFlowRateConfig.suggestedFlowStateDonation;

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const valueWithoutCommas = value.replace(/,/g, "");

    if (isNumber(valueWithoutCommas)) {
      setSupportFlowStateAmount(
        `${
          isNativeSuperToken && parseFloat(valueWithoutCommas) < 1000
            ? value
            : formatNumberWithCommas(parseFloat(valueWithoutCommas))
        }`,
      );
    } else if (value === "") {
      setSupportFlowStateAmount("");
    } else if (value === ".") {
      setSupportFlowStateAmount(isNativeSuperToken ? "0." : "0");
    }
  };

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-info">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 border-0 rounded-0 shadow-none"
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
              {isFundingMatchingPool && isPureSuperToken
                ? 3
                : isFundingMatchingPool || isPureSuperToken
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
            <br />
            <br />
            Alpha: Streams to Flow State are eligible for{" "}
            <Card.Link
              href="https://claim.superfluid.org/apps"
              target="_blank"
              className="text-primary text-decoration-none"
            >
              $SUP rewards!
            </Card.Link>
          </Card.Text>
          <Stack direction="horizontal" gap={2}>
            <Badge className="d-flex align-items-center gap-1 bg-white text-dark w-50 rounded-3 px-3 py-2 fs-5 fw-normal">
              <Image
                src={network?.icon ?? "/eth.png"}
                alt="token"
                width={20}
                height={20}
              />
              {network?.name ?? "N/A"}
            </Badge>
            <Badge className="d-flex align-items-center gap-1 bg-white text-dark w-50 rounded-3 px-3 py-2 fs-5 fw-normal">
              <Image
                src={token.icon ?? "/eth.png"}
                alt="token"
                width={20}
                height={20}
              />
              {token.name}
            </Badge>
          </Stack>
          <Stack direction="horizontal" gap={2} className="mt-3">
            <Stack
              direction="vertical"
              gap={1}
              className="position-relative w-50"
            >
              <Stack direction="horizontal">
                <FormControl
                  type="text"
                  placeholder="0"
                  disabled={!address}
                  value={supportFlowStateAmount}
                  onChange={handleAmountSelection}
                  className={`bg-white border-0 rounded-3 ${
                    isNativeSuperToken ? "" : "rounded-end-0"
                  } shadow-none`}
                />
              </Stack>
              <Card.Text
                className="position-absolute m-0 text-info"
                style={{ right: 8, fontSize: "0.6rem" }}
              >
                Current:{" "}
                {formatNumberWithCommas(
                  parseFloat(
                    roundWeiAmount(
                      BigInt(flowRateToFlowState) *
                        BigInt(
                          fromTimeUnitsToSeconds(
                            1,
                            unitOfTime[supportFlowStateTimeInterval],
                          ),
                        ),
                      4,
                    ),
                  ),
                )}
              </Card.Text>
              <Stack
                direction="horizontal"
                gap={2}
                className="mt-2 align-items-stretch"
              >
                <Button
                  className="p-0"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      (suggestedDonation * 2).toString(),
                    )
                  }
                >
                  {suggestedDonation * 2}
                </Button>
                <Button
                  className="px-0 py-1"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      (suggestedDonation * 5).toString(),
                    )
                  }
                >
                  {suggestedDonation * 5}
                </Button>
                <Button
                  className="px-0 py-1"
                  style={{
                    minWidth: "30%",
                    fontSize: isMobile ? "0.6rem" : "0.8rem",
                  }}
                  onClick={() =>
                    setSupportFlowStateAmount(
                      (suggestedDonation * 10).toString(),
                    )
                  }
                >
                  {suggestedDonation * 10}
                </Button>
              </Stack>
            </Stack>
            <Dropdown className="w-50 align-self-start">
              <Dropdown.Toggle
                variant="blue"
                className="d-flex justify-content-between align-items-center w-100 bg-white border-0 rounded-3 fs-6"
              >
                {supportFlowStateTimeInterval}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={() => {
                    setSupportFlowStateAmount(
                      convertStreamValueToInterval(
                        parseEther(supportFlowStateAmount.replace(/,/g, "")),
                        supportFlowStateTimeInterval,
                        TimeInterval.DAY,
                      ),
                    );
                    setSupportFlowStateTimeInterval(TimeInterval.DAY);
                  }}
                >
                  {TimeInterval.DAY}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => {
                    setSupportFlowStateAmount(
                      convertStreamValueToInterval(
                        parseEther(supportFlowStateAmount.replace(/,/g, "")),
                        supportFlowStateTimeInterval,
                        TimeInterval.WEEK,
                      ),
                    );
                    setSupportFlowStateTimeInterval(TimeInterval.WEEK);
                  }}
                >
                  {TimeInterval.WEEK}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => {
                    setSupportFlowStateAmount(
                      convertStreamValueToInterval(
                        parseEther(supportFlowStateAmount.replace(/,/g, "")),
                        supportFlowStateTimeInterval,
                        TimeInterval.MONTH,
                      ),
                    );
                    setSupportFlowStateTimeInterval(TimeInterval.MONTH);
                  }}
                >
                  {TimeInterval.MONTH}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Stack>
          {Number(supportFlowStateAmount) > 0 &&
            Number(supportFlowStateAmount) < minDonationPerMonth && (
              <Alert variant="warning" className="mt-2 py-2">
                Minimum Donation = {minDonationPerMonth} {token.name}/mo
              </Alert>
            )}
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between mt-3"
          >
            <Button
              variant="transparent"
              className="py-1 rounded-3 text-info"
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
                  Number(supportFlowStateAmount) < minDonationPerMonth)
              }
              className="w-50 py-1 rounded-3 text-light"
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
