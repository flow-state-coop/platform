import { useAccount } from "wagmi";
import { formatEther } from "viem";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import { Step } from "@/types/checkout";
import OnRampWidget from "@/components/OnRampWidget";
import {
  TimeInterval,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";

export type TopUpProps = {
  step: Step;
  setStep: (step: Step) => void;
  newFlowRate: string;
  wrapAmount: string;
  isFundingMatchingPool: boolean;
  passportScore?: number;
  minPassportScore: number;
  superTokenBalance: bigint;
  minEthBalance: number;
  suggestedTokenBalance: bigint;
  hasSufficientEthBalance: boolean;
  hasSufficientTokenBalance: boolean;
  hasSuggestedTokenBalance: boolean;
  ethBalance?: { value: bigint; formatted: string };
  underlyingTokenBalance?: { value: bigint; formatted: string };
};

export default function TopUp(props: TopUpProps) {
  const {
    step,
    setStep,
    newFlowRate,
    wrapAmount,
    isFundingMatchingPool,
    passportScore,
    minPassportScore,
    superTokenBalance,
    suggestedTokenBalance,
    minEthBalance,
    hasSufficientEthBalance,
    hasSufficientTokenBalance,
    hasSuggestedTokenBalance,
    ethBalance,
    underlyingTokenBalance,
  } = props;

  const { address } = useAccount();

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-secondary">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 border-0 rounded-0 shadow-none"
        onClick={() => setStep(Step.TOP_UP)}
        style={{
          pointerEvents:
            step === Step.SELECT_AMOUNT ||
            step === Step.TOP_UP ||
            step === Step.SUCCESS
              ? "none"
              : "auto",
        }}
      >
        <Badge
          pill
          as="div"
          className={`d-flex justify-content-center p-0
                    ${
                      step === Step.SELECT_AMOUNT
                        ? "bg-dark"
                        : step === Step.TOP_UP
                          ? "bg-info"
                          : "bg-secondary"
                    }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {step !== Step.SELECT_AMOUNT && step !== Step.TOP_UP ? (
            <Image
              src="/success.svg"
              alt="done"
              width={16}
              height={16}
              className="m-auto"
            />
          ) : (
            <Card.Text className="m-auto text-white">2</Card.Text>
          )}
        </Badge>
        <Card.Text className="m-0">{Step.TOP_UP}</Card.Text>
      </Button>
      <Accordion.Collapse eventKey={Step.TOP_UP} className="p-3 pt-0">
        <>
          {isFundingMatchingPool ? (
            <Stack
              direction="vertical"
              gap={3}
              className="align-items-center w-50 px-2 py-3 rounded-3 m-auto border border-gray"
            >
              <Card.Text className="m-0 fs-5">ETH Balance:</Card.Text>
              <Card.Text
                className={`d-flex align-items-center gap-1 m-0 fs-3 ${
                  !ethBalance || ethBalance.value === BigInt(0)
                    ? "text-danger"
                    : !hasSuggestedTokenBalance
                      ? "text-yellow"
                      : "text-dark"
                }`}
              >
                {ethBalance
                  ? formatNumberWithCommas(
                      parseFloat(
                        formatEther(ethBalance.value + superTokenBalance).slice(
                          0,
                          8,
                        ),
                      ),
                    )
                  : "0"}
                {hasSuggestedTokenBalance && (
                  <Image
                    src="/success.svg"
                    alt="success"
                    width={28}
                    height={28}
                  />
                )}
              </Card.Text>
              <Card.Text className="m-0 fs-6">
                Suggested{" "}
                {formatNumberWithCommas(
                  parseFloat(roundWeiAmount(suggestedTokenBalance, 6)),
                )}
              </Card.Text>
              <OnRampWidget
                target={
                  <Button className="d-flex justify-content-center align-items-center gap-1 rounded-3 text-white fs-5">
                    <Image
                      src="/credit-card.svg"
                      alt="card"
                      width={24}
                      height={24}
                    />
                    Buy ETH
                  </Button>
                }
                accountAddress={address}
              />
            </Stack>
          ) : (
            <Stack direction="horizontal" gap={3}>
              <Stack
                direction="vertical"
                gap={3}
                className="align-items-center w-50 bg-secondary px-2 py-3 rounded-3"
              >
                <Card.Text className="m-0 fs-5">ETH Balance:</Card.Text>
                <Card.Text
                  className={`d-flex align-items-center gap-1 m-0 fs-3 ${
                    hasSufficientEthBalance ? "text-white" : "text-danger"
                  }`}
                >
                  {ethBalance
                    ? formatNumberWithCommas(
                        parseFloat(ethBalance.formatted.slice(0, 8)),
                      )
                    : "0"}
                  {hasSufficientEthBalance && (
                    <Image
                      src="/success.svg"
                      alt="success"
                      width={18}
                      height={18}
                    />
                  )}
                </Card.Text>
                <Card.Text className="m-0 fs-6">
                  Suggested at least {minEthBalance}
                </Card.Text>
                <OnRampWidget
                  target={
                    <Button className="d-flex justify-content-center align-items-center gap-1 rounded-3 text-white fs-5">
                      <Image
                        src="/credit-card.svg"
                        width={24}
                        height={24}
                        alt="card"
                      />
                      <Card.Text className="m-0">Buy ETH</Card.Text>
                    </Button>
                  }
                />
              </Stack>
              <Stack
                direction="vertical"
                gap={3}
                className="align-items-center w-50 bg-secondary px-2 py-3 rounded-3 fs-5"
              >
                <Card.Text className="m-0 fs-5">DAI + DAIx Balance:</Card.Text>
                <Card.Text
                  className={`d-flex align-items-center gap-1 m-0 fs-3 text-break ${
                    hasSuggestedTokenBalance
                      ? "text-white"
                      : !underlyingTokenBalance ||
                          underlyingTokenBalance.value + superTokenBalance ===
                            BigInt(0)
                        ? "text-danger"
                        : "text-yellow"
                  }`}
                >
                  {underlyingTokenBalance
                    ? formatNumberWithCommas(
                        parseFloat(
                          formatEther(
                            underlyingTokenBalance.value + superTokenBalance,
                          ).slice(0, 8),
                        ),
                      )
                    : "0"}
                  {hasSuggestedTokenBalance && (
                    <Image
                      src="/success.svg"
                      alt="success"
                      width={18}
                      height={18}
                    />
                  )}
                </Card.Text>
                <Card.Text className="m-0 fs-6">
                  Suggested at least{" "}
                  {formatNumberWithCommas(
                    parseFloat(roundWeiAmount(suggestedTokenBalance, 6)),
                  )}
                </Card.Text>
                <Button
                  variant="link"
                  href="https://jumper.exchange/?fromChain=10&fromToken=0x0000000000000000000000000000000000000000&toChain=10&toToken=0x7d342726B69C28D942ad8BfE6Ac81b972349d524"
                  target="_blank"
                  rel="noreferrer"
                  className="d-flex justify-content-center gap-1 bg-primary text-decoration-none rounded-3 text-white fs-4"
                >
                  <Image src="/swap.svg" alt="swap" width={18} height={18} />
                  Get DAIx
                </Button>
              </Stack>
            </Stack>
          )}
          <Button
            variant="transparent"
            className="mt-4 text-dark"
            onClick={() => setStep(Step.WRAP)}
          >
            Skip
          </Button>
          <Button
            variant="success"
            className="w-50 mt-4 py-1 rounded-3 text-white float-end"
            disabled={
              (!isFundingMatchingPool &&
                (!hasSufficientEthBalance || !hasSufficientTokenBalance)) ||
              (isFundingMatchingPool &&
                (!ethBalance ||
                  ethBalance.value + superTokenBalance === BigInt(0)))
            }
            onClick={() =>
              setStep(
                wrapAmount ||
                  superTokenBalance <
                    BigInt(newFlowRate) *
                      BigInt(fromTimeUnitsToSeconds(1, TimeInterval.DAY))
                  ? Step.WRAP
                  : isFundingMatchingPool ||
                      (passportScore && passportScore >= minPassportScore)
                    ? Step.REVIEW
                    : Step.MINT_PASSPORT,
              )
            }
          >
            Continue
          </Button>
        </>
      </Accordion.Collapse>
    </Card>
  );
}
