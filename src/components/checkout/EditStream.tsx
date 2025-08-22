import { useAccount, useSwitchChain } from "wagmi";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import ConnectWallet from "@/components/ConnectWallet";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import {
  TimeInterval,
  fromTimeUnitsToSeconds,
  isNumber,
  formatNumberWithCommas,
} from "@/lib/utils";

export type EditStreamProps = {
  isSelected: boolean;
  setStep: (step: Step) => void;
  token: Token;
  network?: Network;
  flowRateToReceiver: string;
  amountPerTimeInterval: string;
  newFlowRate: string;
  wrapAmount: string;
  setAmountPerTimeInterval: (amount: string) => void;
  isFundingDistributionPool?: boolean;
  isSuperTokenPure?: boolean;
  isEligible?: boolean;
  superTokenBalance: bigint;
  hasSufficientBalance: boolean;
  docsLink: string;
};

export default function EditStream(props: EditStreamProps) {
  const {
    isSelected,
    setStep,
    token,
    network,
    flowRateToReceiver,
    amountPerTimeInterval,
    setAmountPerTimeInterval,
    newFlowRate,
    wrapAmount,
    isFundingDistributionPool,
    isSuperTokenPure,
    isEligible,
    superTokenBalance,
    hasSufficientBalance,
    docsLink,
  } = props;

  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();

  const isDeletingStream =
    BigInt(flowRateToReceiver) > 0 && BigInt(newFlowRate) === BigInt(0);
  const isNativeSuperToken =
    token.symbol === "ETHx" || token.symbol === "CELOx";
  const minAllocationPerMonth = getPoolFlowRateConfig(
    token.symbol,
  ).minAllocationPerMonth;

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const valueWithoutCommas = value.replace(/,/g, "");

    if (isNumber(valueWithoutCommas)) {
      setAmountPerTimeInterval(
        `${
          isNativeSuperToken || parseFloat(valueWithoutCommas) < 1000
            ? value.replace(/ /g, "")
            : formatNumberWithCommas(valueWithoutCommas)
        }`,
      );
    } else if (value === "") {
      setAmountPerTimeInterval("");
    } else if (value === ".") {
      setAmountPerTimeInterval(isNativeSuperToken ? "0." : "0");
    }
  };

  const handleAmountStepping = (stepping: { increment: boolean }) => {
    const { increment } = stepping;

    if (amountPerTimeInterval === "") {
      setAmountPerTimeInterval(increment ? "1" : "0");
    } else if (isNumber(amountPerTimeInterval.replace(/,/g, ""))) {
      const amount = parseFloat(amountPerTimeInterval.replace(/,/g, ""));

      setAmountPerTimeInterval(
        `${formatNumberWithCommas(
          (increment
            ? amount + 1
            : amount - 1 <= 0
              ? 0
              : amount - 1
          ).toString(),
        )}`,
      );
    }
  };

  return (
    <Card className="bg-lace-100 rounded-0 rounded-top-4 border-0 border-bottom border-white">
      <Button
        variant="transparent"
        className="d-flex gap-3 p-4 border-0 rounded-0 shadow-none text-secondary fs-lg fw-semi-bold"
        style={{
          pointerEvents: isSelected ? "none" : "auto",
        }}
        onClick={() => setStep(Step.SELECT_AMOUNT)}
      >
        <Badge
          pill
          as="div"
          className={`d-flex justify-content-center p-0 ${
            isSelected ? "bg-primary" : "bg-info"
          }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {isSelected ? (
            <Card.Text
              className="m-auto text-light"
              style={{ fontFamily: "Helvetica" }}
            >
              1
            </Card.Text>
          ) : (
            <Image src="/success.svg" alt="done" width={16} />
          )}
        </Badge>
        <Card.Text className="m-0 fs-lg fw-semi-bold">
          {Step.SELECT_AMOUNT}
        </Card.Text>
      </Button>
      <Accordion.Collapse eventKey={Step.SELECT_AMOUNT} className="p-4 pt-0">
        <Stack gap={3}>
          <Card.Text className="small mb-1">
            Flow State donations are implemented as continuous money streams—not
            one-time or periodic charges. Your support stream will continue at
            the <strong>rate</strong> you set here until you cancel or modify
            it.{" "}
            <Card.Link
              href={docsLink}
              target="_blank"
              className="text-primary text-decoration-none"
            >
              Learn more here
            </Card.Link>
            .
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
            <Badge className="d-flex align-items-center gap-2 bg-white text-dark w-50 rounded-3 px-3 py-4 fs-lg fw-semi-bold">
              <Image
                src={token.icon ?? "/eth.png"}
                alt="token"
                width={20}
                height={20}
              />
              {token.symbol}
            </Badge>
          </Stack>
          <Stack direction="horizontal" gap={2} className="align-items-stretch">
            <Stack direction="horizontal" className="w-50">
              <Form.Control
                type="text"
                placeholder="0"
                disabled={!address || !flowRateToReceiver}
                value={amountPerTimeInterval}
                onChange={handleAmountSelection}
                className={`bg-white border-0 rounded-4 py-4 fw-semi-bold ${
                  isNativeSuperToken ? "" : "rounded-end-0"
                } shadow-none`}
              />
              {!isNativeSuperToken && (
                <>
                  <Button
                    disabled={!address || !flowRateToReceiver}
                    variant="white"
                    className="d-flex align-items-center bg-white border-0 rounded-0 px-1 py-4"
                    onClick={() => handleAmountStepping({ increment: false })}
                  >
                    <Image
                      src="/remove.svg"
                      alt="remove"
                      width={20}
                      height={20}
                    />
                  </Button>
                  <Button
                    disabled={!address || !flowRateToReceiver}
                    variant="white"
                    className="d-flex align-items-center bg-white border-0 rounded-0 rounded-end-3 px-1 py-4"
                    onClick={() => handleAmountStepping({ increment: true })}
                  >
                    <Image src="/add.svg" alt="add" width={20} height={20} />
                  </Button>
                </>
              )}
            </Stack>
            <Badge className="d-flex align-items-center bg-white w-50 rounded-3 px-3 py-4 text-dark fs-lg fw-semi-bold">
              /month
            </Badge>
          </Stack>
          {Number(amountPerTimeInterval) > 0 &&
            Number(amountPerTimeInterval) < minAllocationPerMonth && (
              <Alert variant="warning" className="m-0 px-3 py-4 fw-semi-bold">
                Minimum Donation = {minAllocationPerMonth} {token.symbol}/mo
              </Alert>
            )}
          <Stack direction="vertical" className="mt-4">
            {network && address ? (
              <Button
                variant={isDeletingStream ? "danger" : "primary"}
                disabled={
                  !amountPerTimeInterval ||
                  Number(amountPerTimeInterval.replace(/,/g, "")) < 0 ||
                  (BigInt(flowRateToReceiver) === BigInt(0) &&
                    Number(amountPerTimeInterval.replace(/,/g, "")) === 0) ||
                  (!isDeletingStream &&
                    Number(amountPerTimeInterval) < minAllocationPerMonth) ||
                  newFlowRate === flowRateToReceiver
                }
                className="px-10 py-4 rounded-4 fw-semi-bold text-light"
                onClick={() => {
                  if (connectedChain?.id !== network.id) {
                    switchChain({ chainId: network.id });
                  } else {
                    setStep(
                      !hasSufficientBalance
                        ? Step.TOP_UP
                        : !isSuperTokenPure &&
                            (wrapAmount ||
                              superTokenBalance <
                                BigInt(newFlowRate) *
                                  BigInt(
                                    fromTimeUnitsToSeconds(1, TimeInterval.DAY),
                                  ))
                          ? Step.WRAP
                          : !isFundingDistributionPool && !isEligible
                            ? Step.ELIGIBILITY
                            : !sessionStorage.getItem("skipSupportFlowState") &&
                                !localStorage.getItem("skipSupportFlowState")
                              ? Step.SUPPORT
                              : Step.REVIEW,
                    );
                  }
                }}
              >
                {isDeletingStream ? "Cancel Stream" : "Continue"}
              </Button>
            ) : (
              <ConnectWallet />
            )}
            {BigInt(flowRateToReceiver) > 0 && !isDeletingStream && (
              <Button
                variant="transparent"
                className="w-100 text-primary text-decoration-underline fw-semi-bold border-0 pb-0"
                onClick={() => {
                  setAmountPerTimeInterval("0");
                  setStep(Step.REVIEW);
                }}
              >
                Cancel stream
              </Button>
            )}
          </Stack>
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
