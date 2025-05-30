import { useAccount, useSwitchChain } from "wagmi";
import { parseEther } from "viem";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import { Step } from "../../types/distributionPoolFunding";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import ConnectWallet from "@/components/ConnectWallet";
import {
  TimeInterval,
  fromTimeUnitsToSeconds,
  isNumber,
  formatNumberWithCommas,
  convertStreamValueToInterval,
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
  timeInterval: TimeInterval;
  setAmountPerTimeInterval: (amount: string) => void;
  setTimeInterval: (timeInterval: TimeInterval) => void;
  superTokenBalance: bigint;
  hasSufficientBalance: boolean;
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
    timeInterval,
    setTimeInterval,
    superTokenBalance,
    hasSufficientBalance,
  } = props;

  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();

  const isDeletingStream =
    BigInt(flowRateToReceiver) > 0 && BigInt(newFlowRate) === BigInt(0);

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const valueWithoutCommas = value.replace(/,/g, "");

    if (isNumber(valueWithoutCommas)) {
      setAmountPerTimeInterval(
        `${
          parseFloat(valueWithoutCommas) < 1000
            ? value.replace(/ /g, "")
            : formatNumberWithCommas(parseFloat(valueWithoutCommas))
        }`,
      );
    } else if (value === "") {
      setAmountPerTimeInterval("");
    } else if (value === ".") {
      setAmountPerTimeInterval("0.");
    }
  };

  return (
    <Card className="bg-light rounded-0 rounded-top-4 border-0 border-bottom border-info">
      <Button
        variant="transparent"
        className="d-flex align-items-center gap-2 p-3 pb-2 border-0 rounded-0 shadow-none"
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
        <Card.Text className="m-0">{Step.SELECT_AMOUNT}</Card.Text>
      </Button>
      <Accordion.Collapse eventKey={Step.SELECT_AMOUNT} className="p-3 pt-0">
        <Stack gap={3}>
          <Card.Text className="small mb-1">
            Flow State donations are implemented as continuous money streams—not
            one-time or periodic charges. Your support stream will continue at
            the <strong>rate</strong> you set here until you cancel or modify
            it.{" "}
            <Card.Link
              href="https://docs.flowstate.network/donors-voters"
              target="_blank"
              className="text-primary"
            >
              Learn more here
            </Card.Link>
            .
          </Card.Text>
          <Stack direction="horizontal" gap={2}>
            <Badge className="d-flex align-items-center gap-1 bg-white text-dark w-50 rounded-3 px-3 py-2 fs-5 fw-normal">
              <Image
                src={network?.icon ?? "/eth.svg"}
                alt="token"
                width={20}
                height={20}
              />
              {network?.name ?? "N/A"}
            </Badge>
            <Badge className="d-flex align-items-center gap-1 bg-white text-dark w-50 rounded-3 px-3 py-2 fs-5 fw-normal">
              {token.icon && (
                <Image src={token.icon} alt="Token" width={20} height={20} />
              )}
              {token.symbol}
            </Badge>
          </Stack>
          <Stack direction="horizontal" gap={2}>
            <Stack direction="horizontal" className="w-50">
              <Form.Control
                type="text"
                placeholder="0"
                disabled={!address || !flowRateToReceiver}
                value={amountPerTimeInterval}
                onChange={handleAmountSelection}
                className="bg-white border-0 rounded-3 rounded-end-0 shadow-none"
              />
            </Stack>
            <Dropdown className="w-50">
              <Dropdown.Toggle
                variant="blue"
                className="d-flex justify-content-between align-items-center w-100 bg-white border-0 rounded-3 fs-6"
              >
                {timeInterval}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={() => {
                    setAmountPerTimeInterval(
                      convertStreamValueToInterval(
                        parseEther(amountPerTimeInterval.replace(/,/g, "")),
                        timeInterval,
                        TimeInterval.DAY,
                      ),
                    );
                    setTimeInterval(TimeInterval.DAY);
                  }}
                >
                  {TimeInterval.DAY}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => {
                    setAmountPerTimeInterval(
                      convertStreamValueToInterval(
                        parseEther(amountPerTimeInterval.replace(/,/g, "")),
                        timeInterval,
                        TimeInterval.WEEK,
                      ),
                    );
                    setTimeInterval(TimeInterval.WEEK);
                  }}
                >
                  {TimeInterval.WEEK}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => {
                    setAmountPerTimeInterval(
                      convertStreamValueToInterval(
                        parseEther(amountPerTimeInterval.replace(/,/g, "")),
                        timeInterval,
                        TimeInterval.MONTH,
                      ),
                    );
                    setTimeInterval(TimeInterval.MONTH);
                  }}
                >
                  {TimeInterval.MONTH}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Stack>
          <Stack direction="vertical">
            {network && address ? (
              <Button
                variant={isDeletingStream ? "danger" : "primary"}
                disabled={
                  !amountPerTimeInterval ||
                  Number(amountPerTimeInterval.replace(/,/g, "")) < 0 ||
                  (BigInt(flowRateToReceiver) === BigInt(0) &&
                    Number(amountPerTimeInterval.replace(/,/g, "")) === 0) ||
                  newFlowRate === flowRateToReceiver
                }
                className="py-1 rounded-3 text-light"
                onClick={() => {
                  if (connectedChain?.id !== network.id) {
                    switchChain({ chainId: network.id });
                  } else {
                    setStep(
                      !hasSufficientBalance
                        ? Step.TOP_UP
                        : wrapAmount ||
                            superTokenBalance <
                              BigInt(newFlowRate) *
                                BigInt(
                                  fromTimeUnitsToSeconds(1, TimeInterval.DAY),
                                )
                          ? Step.WRAP
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
                className="w-100 text-primary text-decoration-underline border-0 pb-0"
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
