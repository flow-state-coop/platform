import { useAccount } from "wagmi";
import { formatEther, formatUnits } from "viem";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { formatNumberWithCommas, isNumber } from "@/lib/utils";

export type WrapProps = {
  step: Step;
  setStep: (step: Step) => void;
  wrapAmount: string;
  setWrapAmount: (amount: string) => void;
  isFundingMatchingPool: boolean;
  isEligible?: boolean;
  token: Token;
  superTokenBalance: bigint;
  underlyingTokenBalance?: {
    value: bigint;
    formatted: string;
    decimals: number;
    symbol: string;
  };
};

export default function Wrap(props: WrapProps) {
  const {
    step,
    setStep,
    wrapAmount,
    setWrapAmount,
    token,
    isFundingMatchingPool,
    isEligible,
    superTokenBalance,
    underlyingTokenBalance,
  } = props;

  const { address } = useAccount();

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const valueWithoutCommas = value.replace(/,/g, "");

    if (isNumber(valueWithoutCommas)) {
      setWrapAmount(
        `${
          isFundingMatchingPool && parseFloat(valueWithoutCommas) < 1000
            ? value
            : formatNumberWithCommas(parseFloat(valueWithoutCommas))
        }`,
      );
    } else if (value === "") {
      setWrapAmount("");
    } else if (value === ".") {
      setWrapAmount(isFundingMatchingPool ? "0." : "0");
    }
  };

  return (
    <Card className="bg-light rounded-0 border-0 border-bottom border-secondary">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 border-0 rounded-0 shadow-none"
        onClick={() => setStep(Step.WRAP)}
        style={{
          pointerEvents:
            step === Step.REVIEW || step === Step.ELIGIBILITY ? "auto" : "none",
        }}
      >
        <Badge
          pill
          as="div"
          className={`d-flex justify-content-center p-0
                    ${
                      step === Step.SELECT_AMOUNT || step === Step.TOP_UP
                        ? "bg-secondary"
                        : step === Step.WRAP
                          ? "bg-primary"
                          : "bg-info"
                    }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {step === Step.REVIEW ||
          step === Step.ELIGIBILITY ||
          step === Step.SUCCESS ? (
            <Image
              src="/success.svg"
              alt="done"
              width={16}
              height={16}
              className="m-auto"
            />
          ) : (
            <Card.Text className="m-auto text-light">3</Card.Text>
          )}
        </Badge>
        {Step.WRAP}
      </Button>
      <Accordion.Collapse eventKey={Step.WRAP} className="p-3 pt-0">
        <Stack direction="vertical" gap={3}>
          <Stack direction="vertical" className="position-relative">
            <Stack
              direction="horizontal"
              gap={2}
              className="w-100 bg-white p-2 rounded-4 rounded-bottom-0"
            >
              <Form.Control
                type="text"
                placeholder="0"
                disabled={!address}
                value={wrapAmount ?? ""}
                className="bg-purple w-75 border-0 shadow-none"
                onChange={handleAmountSelection}
              />
              <Badge
                as="div"
                className="d-flex justify-content-center align-items-center w-25 gap-1 bg-light text-dark py-2 rounded-3"
              >
                <Image src={token.icon} alt="done" width={18} height={18} />
                <Card.Text className="p-0">
                  {underlyingTokenBalance?.symbol ?? "N/A"}
                </Card.Text>
              </Badge>
            </Stack>
            <Card.Text className="w-100 bg-white m-0 mb-2 px-2 pb-2 rounded-bottom-4 text-end fs-6">
              Balance:{" "}
              {underlyingTokenBalance
                ? underlyingTokenBalance.formatted.slice(0, 8)
                : ""}
            </Card.Text>
            <Badge
              pill
              className="position-absolute top-50 start-50 translate-middle bg-light p-1"
            >
              <Image
                src="/expand-more.svg"
                alt="downward arrow"
                width={22}
                height={22}
              />
            </Badge>
            <Stack
              direction="horizontal"
              gap={2}
              className="w-100 bg-white p-2 rounded-4 rounded-bottom-0"
            >
              <Form.Control
                type="text"
                placeholder="0"
                disabled={!address}
                value={wrapAmount ?? ""}
                className="bg-white w-75 border-0 shadow-none"
                onChange={handleAmountSelection}
              />
              <Badge
                as="div"
                className="d-flex justify-content-center align-items-center gap-1 w-25 bg-light text-dark py-2 rounded-3"
              >
                <Image src={token.icon} alt="done" width={18} height={18} />
                <Card.Text className="p-0">{token.name}</Card.Text>
              </Badge>
            </Stack>
            <Card.Text className="w-100 bg-white m-0 px-2 pb-2 rounded-bottom-4 text-end fs-6">
              Balance: {formatEther(superTokenBalance).slice(0, 8)}
            </Card.Text>
          </Stack>
          {underlyingTokenBalance &&
            wrapAmount &&
            Number(
              formatUnits(
                underlyingTokenBalance.value,
                underlyingTokenBalance.decimals,
              ),
            ) < Number(wrapAmount.replace(/,/g, "")) && (
              <Alert variant="danger" className="m-0">
                Insufficient Balance
              </Alert>
            )}
          <Stack direction="horizontal" gap={2}>
            <OverlayTrigger
              overlay={
                <Tooltip id="t-skip-wrap" className="fs-6">
                  You can skip wrapping if you already have an {token.name}{" "}
                  balance.
                </Tooltip>
              }
            >
              <Button
                variant="primary"
                disabled={superTokenBalance <= BigInt(0)}
                className="w-50 py-1 rounded-3 text-light"
                onClick={() => {
                  setWrapAmount("");
                  setStep(
                    isFundingMatchingPool || isEligible
                      ? Step.REVIEW
                      : Step.ELIGIBILITY,
                  );
                }}
              >
                Skip
              </Button>
            </OverlayTrigger>
            <Button
              disabled={
                !underlyingTokenBalance ||
                !wrapAmount ||
                Number(wrapAmount.replace(/,/g, "")) === 0 ||
                Number(
                  formatUnits(
                    underlyingTokenBalance.value,
                    underlyingTokenBalance.decimals,
                  ),
                ) < Number(wrapAmount.replace(/,/g, ""))
              }
              className="w-50 py-1 rounded-3 text-light"
              onClick={() =>
                setStep(
                  isFundingMatchingPool || isEligible
                    ? Step.REVIEW
                    : Step.ELIGIBILITY,
                )
              }
            >
              Continue
            </Button>
          </Stack>
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
