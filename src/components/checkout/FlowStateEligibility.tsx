import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Address } from "viem";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { Step } from "@/types/checkout";
import { Network } from "@/types/network";
import { truncateStr } from "@/lib/utils";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export type FlowStateEligibilityProps = {
  step: Step;
  setStep: (step: Step) => void;
  network?: Network;
  requiredNftAddress: Address;
  isEligible: boolean;
  isSuperTokenPure: boolean;
};

export default function FlowStateEligibility(props: FlowStateEligibilityProps) {
  const {
    step,
    setStep,
    network,
    requiredNftAddress,
    isEligible,
    isSuperTokenPure,
  } = props;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFirstCheck, setIsFirstCheck] = useState(isEligible ? false : true);

  const { address } = useAccount();

  const handleNftMintRequest = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const res = await fetch("/api/flow-state-eligibility", {
        method: "POST",
        body: JSON.stringify({
          address,
          chainId: network?.id ?? DEFAULT_CHAIN_ID,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      if (!data.success && !isFirstCheck) {
        setError(data.error);
      }

      setIsLoading(false);

      console.info(data);
    } catch (err) {
      setIsLoading(false);
      setError("There was an error. Please try again later.");

      console.error(err);
    }
  }, [address, network, isFirstCheck]);

  useEffect(() => {
    (async () => {
      if (address && !isEligible && isFirstCheck) {
        await handleNftMintRequest();

        setIsFirstCheck(false);
      }
    })();
  }, [address, isEligible, isFirstCheck, handleNftMintRequest]);

  return (
    <Card className="bg-lace-100 rounded-0 border-0 border-bottom border-white">
      <Button
        variant="transparent"
        className="d-flex gap-3 p-4 border-0 rounded-0 shadow-none text-secondary fs-lg fw-semi-bold"
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
              {isSuperTokenPure ? 3 : 4}
            </Card.Text>
          )}
        </Badge>
        {Step.ELIGIBILITY}
      </Button>
      <Accordion.Collapse eventKey={Step.ELIGIBILITY} className="p-3 py-0">
        <Stack direction="vertical" gap={2}>
          <Stack
            direction="horizontal"
            gap={3}
            className="justify-content-between mb-4"
          >
            <Stack direction="vertical" gap={2} className="align-items-center">
              {isFirstCheck ? (
                <Spinner />
              ) : (
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
              )}
              <Card.Text
                className={`m-0 ${isEligible ? "text-success" : isFirstCheck ? "text-black" : "text-danger"}`}
              >
                {isEligible
                  ? "Eligibile"
                  : isFirstCheck
                    ? "Checking Eligibility"
                    : "Ineligible"}
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
          {!isFirstCheck && (
            <>
              <Button
                variant="link"
                href="https://app.passport.xyz"
                target="_blank"
                className="bg-secondary text-light text-decoration-none px-10 py-4 rounded-4 fw-semi-bold"
              >
                {isEligible
                  ? "Check Your Score"
                  : `1. Earn Stamps (min = ${network?.flowStateEligibilityMinScore})`}
              </Button>
              <Button
                disabled={isEligible}
                className="d-flex justify-content-center align-items-center gap-2 px-10 py-4 rounded-4 fw-semi-bold"
                onClick={!isLoading ? handleNftMintRequest : void 0}
              >
                {isEligible ? "Claim NFT" : "2. Claim NFT"}
                {isLoading && <Spinner size="sm" />}
              </Button>
              {error && error === "Ineligible" ? (
                <p className="mb-1 small text-center text-danger fw-smei-bold">
                  Not yet eligible. Request manual verification in our{" "}
                  <Link
                    href="https://t.me/flowstatecoop"
                    target="_blank"
                    className="text-danger"
                  >
                    Telegram
                  </Link>
                  .
                </p>
              ) : (
                <p className="mb-1 small text-center text-danger fw-smei-bold">
                  {error}
                </p>
              )}
              <Button
                disabled={!isEligible}
                className="w-100 m-0 ms-auto mt-1 mb-3 text-light px-10py-10 rounded-4 fw-semi-bold"
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
            </>
          )}
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
