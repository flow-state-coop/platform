import { formatEther } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import { Step } from "@/types/checkout";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { useMediaQuery } from "@/hooks/mediaQuery";
import {
  TimeInterval,
  fromTimeUnitsToSeconds,
  formatNumber,
  roundWeiAmount,
} from "@/lib/utils";

export type TopUpProps = {
  step: Step;
  setStep: (step: Step) => void;
  newFlowRate: string;
  wrapAmount: string;
  isFundingMatchingPool?: boolean;
  isFundingFlowStateCore?: boolean;
  isEligible?: boolean;
  superTokenBalance: bigint;
  minEthBalance: number;
  suggestedTokenBalance: bigint;
  hasSufficientEthBalance: boolean;
  hasSufficientTokenBalance: boolean;
  hasSuggestedTokenBalance: boolean;
  ethBalance?: { value: bigint; formatted: string; symbol: string };
  underlyingTokenBalance?: { value: bigint; formatted: string; symbol: string };
  network?: Network;
  superTokenInfo: Token;
};

export default function TopUp(props: TopUpProps) {
  const {
    step,
    setStep,
    newFlowRate,
    wrapAmount,
    isFundingMatchingPool,
    isFundingFlowStateCore,
    isEligible,
    superTokenBalance,
    suggestedTokenBalance,
    minEthBalance,
    hasSufficientEthBalance,
    hasSufficientTokenBalance,
    hasSuggestedTokenBalance,
    ethBalance,
    underlyingTokenBalance,
    network,
    superTokenInfo,
  } = props;

  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isMobile } = useMediaQuery();

  const isUnderlyingTokenNative = underlyingTokenBalance?.symbol === "ETH";
  const isSupertokenPure = !underlyingTokenBalance;

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-info">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 pb-2 border-0 rounded-0 shadow-none"
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
                        ? "bg-secondary"
                        : step === Step.TOP_UP
                          ? "bg-primary"
                          : "bg-info"
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
            <Card.Text
              className="m-auto text-light"
              style={{ fontFamily: "Helvetica" }}
            >
              2
            </Card.Text>
          )}
        </Badge>
        <Card.Text className="m-0">{Step.TOP_UP}</Card.Text>
      </Button>
      <Accordion.Collapse eventKey={Step.TOP_UP} className="p-3 pt-0">
        <>
          <Card.Text className="small mb-4">
            Make sure you have enough {ethBalance?.symbol}{" "}
            {!isUnderlyingTokenNative
              ? `and ${underlyingTokenBalance?.symbol}`
              : ""}{" "}
            to pay for gas and to fund your stream. We recommend having at least
            3 months of{" "}
            {isUnderlyingTokenNative
              ? ethBalance?.symbol
              : underlyingTokenBalance?.symbol}{" "}
            to stream.
          </Card.Text>
          {isUnderlyingTokenNative ? (
            <Stack
              direction="vertical"
              gap={3}
              className="align-items-center m-auto px-2 py-3 rounded-3 fs-6 border border-gray"
              style={{ width: isMobile ? "100%" : "50%" }}
            >
              {!underlyingTokenBalance ? (
                <Card.Text className="m-0 small">
                  {superTokenInfo.symbol}:
                </Card.Text>
              ) : (
                <Card.Text className="m-0 small">
                  {underlyingTokenBalance?.symbol ?? "N/A"} +{" "}
                  {superTokenInfo.symbol}:
                </Card.Text>
              )}
              <Card.Text
                className={`d-flex align-items-center gap-1 m-0 fs-4 text-truncate ${
                  hasSuggestedTokenBalance
                    ? ""
                    : (underlyingTokenBalance &&
                          underlyingTokenBalance.value + superTokenBalance ===
                            BigInt(0)) ||
                        (!underlyingTokenBalance &&
                          superTokenBalance === BigInt(0))
                      ? "text-danger"
                      : "text-warning"
                }`}
              >
                {formatNumber(
                  Number(
                    formatEther(
                      (underlyingTokenBalance?.value ?? BigInt(0)) +
                        superTokenBalance,
                    ),
                  ),
                )}
                {hasSuggestedTokenBalance && (
                  <Image
                    src="/success.svg"
                    alt="success"
                    width={18}
                    height={18}
                  />
                )}
              </Card.Text>
              <Card.Text as="small" className="m-0 text-center">
                Suggested{" "}
                {formatNumber(Number(roundWeiAmount(suggestedTokenBalance, 6)))}
                +
                <br />
                <span style={{ fontSize: "0.8rem" }}>(3 months stream)</span>
              </Card.Text>
              <Button
                variant="link"
                href="https://app.across.to/bridge"
                target="_blank"
                className="w-100 bg-secondary text-decoration-none rounded-3 text-light fs-6 overflow-hidden"
              >
                <Card.Text className="m-0 text-truncate">
                  Bridge to {network?.name}
                </Card.Text>
              </Button>
              <Button
                variant="link"
                onClick={(e) => {
                  if (!address) {
                    e.preventDefault();

                    if (openConnectModal) {
                      openConnectModal();
                    }
                  }
                }}
                href={`https://pay.coinbase.com/buy/select-asset?appId=36e18bf4-7c5c-416f-a0a1-7eab5d8453e7&addresses={"${address}":["${network?.onRampLabel ?? "base"}"]}&assets=["ETH"]&presetFiatAmount=25`}
                target="_blank"
                className="w-100 bg-primary text-decoration-none rounded-3 text-light fs-6"
              >
                Buy {ethBalance?.symbol ?? "ETH"}
              </Button>
            </Stack>
          ) : (
            <>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                gap={3}
                className="justify-content-center"
              >
                <Stack
                  direction="vertical"
                  gap={3}
                  className="align-items-center flex-grow-0 px-2 py-3 rounded-3 border border-gray"
                  style={{ width: isMobile ? "100%" : "50%" }}
                >
                  <Card.Text className="m-0 small">
                    {ethBalance?.symbol ?? "ETH"}:
                  </Card.Text>
                  <Card.Text
                    className={`d-flex align-items-center gap-1 m-0 fs-4 ${
                      hasSufficientEthBalance ? "" : "text-danger"
                    }`}
                  >
                    {ethBalance
                      ? formatNumber(Number(ethBalance.formatted))
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
                  <Card.Text as="small" className="m-0 text-center">
                    Suggested {minEthBalance}
                    <br />
                    <br />
                  </Card.Text>
                  <Button
                    variant="link"
                    href="https://app.across.to/bridge"
                    target="_blank"
                    className="w-100 bg-secondary text-decoration-none rounded-3 text-light fs-6 overflow-hidden"
                  >
                    <Card.Text className="m-0 text-truncate">
                      Bridge to {network?.name}
                    </Card.Text>
                  </Button>
                  <Button
                    variant="link"
                    onClick={(e) => {
                      if (!address) {
                        e.preventDefault();

                        if (openConnectModal) {
                          openConnectModal();
                        }
                      }
                    }}
                    href={`https://pay.coinbase.com/buy/select-asset?appId=36e18bf4-7c5c-416f-a0a1-7eab5d8453e7&addresses={"${address}":["${network?.onRampLabel ?? "base"}"]}&assets=["ETH"]&presetFiatAmount=25`}
                    target="_blank"
                    className="w-100 bg-primary text-decoration-none rounded-3 text-light fs-6"
                  >
                    Buy {ethBalance?.symbol ?? "ETH"}
                  </Button>
                </Stack>
                <Stack
                  direction="vertical"
                  gap={3}
                  className="align-items-center px-2 py-3 rounded-3 fs-6 border border-gray"
                  style={{ width: isMobile ? "100%" : "50%" }}
                >
                  {!underlyingTokenBalance ? (
                    <Card.Text className="m-0 small">
                      {superTokenInfo.symbol}:
                    </Card.Text>
                  ) : (
                    <Card.Text className="m-0 small">
                      {underlyingTokenBalance?.symbol ?? "N/A"} +{" "}
                      {superTokenInfo.symbol}:
                    </Card.Text>
                  )}
                  <Card.Text
                    className={`d-flex align-items-center gap-1 m-0 fs-4 text-truncate ${
                      hasSuggestedTokenBalance
                        ? ""
                        : (underlyingTokenBalance &&
                              underlyingTokenBalance.value +
                                superTokenBalance ===
                                BigInt(0)) ||
                            (!underlyingTokenBalance &&
                              superTokenBalance === BigInt(0))
                          ? "text-danger"
                          : "text-warning"
                    }`}
                  >
                    {formatNumber(
                      Number(
                        formatEther(
                          (underlyingTokenBalance?.value ?? BigInt(0)) +
                            superTokenBalance,
                        ),
                      ),
                    )}
                    {hasSuggestedTokenBalance && (
                      <Image
                        src="/success.svg"
                        alt="success"
                        width={18}
                        height={18}
                      />
                    )}
                  </Card.Text>
                  <Card.Text as="small" className="m-0 text-center">
                    Suggested{" "}
                    {formatNumber(
                      Number(roundWeiAmount(suggestedTokenBalance, 6)),
                    )}
                    +
                    <br />
                    <span style={{ fontSize: "0.8rem" }}>
                      (3 months stream)
                    </span>
                  </Card.Text>
                  <Button
                    variant="link"
                    href={`https://jumper.exchange/?fromChain=${network?.id ?? ""}&fromToken=0x0000000000000000000000000000000000000000&toChain=${network?.id ?? ""}&toToken=${superTokenInfo.address}`}
                    target="_blank"
                    className="w-100 bg-primary text-decoration-none rounded-3 text-light fs-6"
                  >
                    Get {superTokenInfo.symbol}
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
          <Button
            variant="transparent"
            className="mt-4 text-info"
            onClick={() =>
              setStep(
                !isSupertokenPure &&
                  (wrapAmount ||
                    superTokenBalance <
                      BigInt(newFlowRate) *
                        BigInt(fromTimeUnitsToSeconds(1, TimeInterval.DAY)))
                  ? Step.WRAP
                  : !isFundingMatchingPool &&
                      !isFundingFlowStateCore &&
                      !isEligible
                    ? Step.ELIGIBILITY
                    : !sessionStorage.getItem("skipSupportFlowState") &&
                        !localStorage.getItem("skipSupportFlowState")
                      ? Step.SUPPORT
                      : Step.REVIEW,
              )
            }
          >
            Skip
          </Button>
          <Button
            className="w-50 mt-4 py-1 rounded-3 float-end text-light"
            disabled={!hasSufficientEthBalance || !hasSufficientTokenBalance}
            onClick={() =>
              setStep(
                !isSupertokenPure &&
                  (wrapAmount ||
                    superTokenBalance <
                      BigInt(newFlowRate) *
                        BigInt(fromTimeUnitsToSeconds(1, TimeInterval.DAY)))
                  ? Step.WRAP
                  : !isFundingMatchingPool &&
                      !isFundingFlowStateCore &&
                      !isEligible
                    ? Step.ELIGIBILITY
                    : !sessionStorage.getItem("skipSupportFlowState") &&
                        !localStorage.getItem("skipSupportFlowState")
                      ? Step.SUPPORT
                      : Step.REVIEW,
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
