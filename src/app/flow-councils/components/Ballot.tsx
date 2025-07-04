import { useState, useRef, useEffect } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import { useAccount } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import FormControl from "react-bootstrap/FormControl";
import useCouncil from "../hooks/council";
import useWriteAllocation from "../hooks/writeAllocation";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { isNumber } from "@/lib/utils";

export default function Ballot({
  councilAddress,
}: {
  councilAddress: `0x${string}`;
}) {
  const [success, setSuccess] = useState(false);

  const successCardRef = useRef<HTMLDivElement>(null);

  const {
    council,
    currentAllocation,
    newAllocation,
    flowStateProfiles,
    dispatchNewAllocation,
  } = useCouncil();
  const { address } = useAccount();
  const { isMobile } = useMediaQuery();
  const { vote, isVoting, transactionError } =
    useWriteAllocation(councilAddress);

  const votingPower =
    council?.councilMembers.find(
      (councilMember) => councilMember.account === address?.toLowerCase(),
    )?.votingPower ?? 0;
  const totalVotes =
    newAllocation?.allocation
      ?.map((a) => a.amount)
      ?.reduce((a, b) => a + b, 0) ?? 0;
  const newAllocationsCount = newAllocation?.allocation?.length ?? 0;
  const maxAllocationsPerMember = council?.maxAllocationsPerMember ?? 0;

  useEffect(() => {
    if (success) {
      if (successCardRef.current) {
        successCardRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [success]);

  const handleAmountStepping = (args: {
    increment: boolean;
    granteeIndex: number;
  }) => {
    const { increment, granteeIndex } = args;

    const granteeAddress = newAllocation?.allocation[granteeIndex].grantee;
    const currentAmount = newAllocation?.allocation[granteeIndex].amount ?? 0;

    if (granteeAddress) {
      const newAmount = increment
        ? currentAmount + 1
        : currentAmount - 1 < 0
          ? 0
          : currentAmount - 1;

      setSuccess(false);
      dispatchNewAllocation({
        type: "update",
        allocation: { grantee: granteeAddress, amount: newAmount },
      });
    }
  };

  const handleAmountSelection = (
    e: React.ChangeEvent<HTMLInputElement>,
    granteeIndex: number,
  ) => {
    const { value } = e.target;

    const granteeAddress = newAllocation?.allocation[granteeIndex].grantee;

    if (isNumber(value) && granteeAddress) {
      dispatchNewAllocation({
        type: "update",
        allocation: { grantee: granteeAddress, amount: Number(value) },
      });

      setSuccess(false);
    } else if (value === "" && granteeAddress) {
      dispatchNewAllocation({
        type: "update",
        allocation: { grantee: granteeAddress, amount: 0 },
      });

      setSuccess(false);
    }
  };

  const handleVote = async () => {
    if (newAllocation && newAllocation?.allocation.length > 0) {
      const nonZeroAllocations = newAllocation.allocation.filter(
        (a) => a.amount !== 0,
      );
      const accounts = nonZeroAllocations.map((a) => a.grantee);
      const amounts = nonZeroAllocations.map((a) => BigInt(a.amount));

      const receipt = await vote(accounts as `0x${string}`[], amounts);

      if (receipt?.status === "success") {
        setSuccess(true);
      }
    }
  };

  return (
    <Offcanvas
      show
      onHide={() => {
        const zeroAllocations = newAllocation?.allocation.filter(
          (a) => a.amount === 0,
        );

        if (zeroAllocations) {
          for (const allocation of zeroAllocations) {
            dispatchNewAllocation({
              type: "delete",
              allocation,
            });
          }
        }

        dispatchNewAllocation({ type: "hide-ballot" });
      }}
      placement={isMobile ? "bottom" : "end"}
      style={{ height: "100%" }}
    >
      <Offcanvas.Header closeButton className="pb-0 align-items-start">
        <Stack direction="vertical">
          <Offcanvas.Title className="fs-4">Cast your votes</Offcanvas.Title>
          <p className="text-info fs-6 mt-2 mb-3">
            You will submit your ballot as a whole. You can reallocate your
            votes at any time.
          </p>
        </Stack>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack
          direction="horizontal"
          className="justify-content-around flex-grow-0 mb-1"
        >
          <p
            className={`m-0 fs-6 ${newAllocationsCount > maxAllocationsPerMember ? "text-danger" : "text-info"}`}
            style={{
              visibility: maxAllocationsPerMember === 0 ? "hidden" : "visible",
            }}
          >
            ({newAllocation?.allocation?.length ?? 0}/{maxAllocationsPerMember}{" "}
            Projects)
          </p>
          <p
            className={`m-0 fs-6 ${totalVotes > votingPower ? "text-danger" : "text-info"}`}
          >
            ({totalVotes}/{votingPower} Votes)
          </p>
        </Stack>
        <Stack
          direction="vertical"
          gap={4}
          className="flex-grow-0 bg-light rounded-4 px-3 py-4"
        >
          {newAllocation?.allocation?.map((allocation, i) => {
            const councilGrantee = council?.grantees.find(
              (grantee) => grantee.account === allocation.grantee,
            );
            const profile = flowStateProfiles?.find(
              (profile: { id: string }) =>
                profile.id === councilGrantee?.metadata,
            );

            return (
              <Stack
                direction="horizontal"
                className="justify-content-between overflow-hidden"
                key={i}
              >
                <Stack direction="horizontal" className="w-50">
                  <Button
                    variant="transparent"
                    className="p-1 ps-0"
                    onClick={() => {
                      setSuccess(false);
                      dispatchNewAllocation({
                        type: "delete",
                        allocation,
                      });
                    }}
                  >
                    <Image
                      src="/close.svg"
                      alt="delete"
                      width={20}
                      height={20}
                      style={{
                        filter:
                          "invert(30%) sepia(64%) saturate(1597%) hue-rotate(324deg) brightness(93%) contrast(103%)",
                      }}
                    />
                  </Button>
                  <p
                    className="m-0 text-truncate"
                    style={{ fontSize: "1.2rem" }}
                  >
                    {profile?.metadata.title}
                  </p>
                </Stack>
                <Stack
                  direction="horizontal"
                  className="justify-content-end align-items-stretch w-50"
                >
                  <Button
                    className="d-flex justify-content-center align-items-center bg-info border-black border-end-0 w-25 rounded-0 rounded-start-2 fs-4 px-1 py-2"
                    onClick={() =>
                      handleAmountStepping({
                        increment: false,
                        granteeIndex: i,
                      })
                    }
                  >
                    <Image
                      src="/remove.svg"
                      alt="remove"
                      width={18}
                      height={18}
                    />
                  </Button>
                  <FormControl
                    type="text"
                    value={allocation.amount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleAmountSelection(e, i)
                    }
                    className="text-center w-33 bg-white border-black border-start-0 border-end-0 rounded-0 shadow-none"
                  />
                  <Button
                    variant="white"
                    className="d-flex justify-content-center align-items-center w-25 bg-info border-black border-start-0 rounded-0 rounded-end-3 fs-4 px-1 py-2"
                    onClick={() =>
                      handleAmountStepping({ increment: true, granteeIndex: i })
                    }
                  >
                    <Image src="/add.svg" alt="add" width={18} height={18} />
                  </Button>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
        <Stack direction="vertical" className="mt-3">
          <Button
            variant={success ? "success" : "primary"}
            disabled={
              !success &&
              (totalVotes > votingPower ||
                (maxAllocationsPerMember &&
                  newAllocationsCount > maxAllocationsPerMember) ||
                !newAllocation?.allocation ||
                newAllocation.allocation.length === 0 ||
                JSON.stringify(currentAllocation?.allocation) ===
                  JSON.stringify(newAllocation?.allocation))
            }
            className={`align-self-end w-50 ${success ? "py-1" : ""}`}
            onClick={handleVote}
            style={{ pointerEvents: success ? "none" : "auto" }}
          >
            {isVoting ? (
              <Spinner size="sm" />
            ) : success ? (
              <Image
                src="/success.svg"
                alt="Success"
                width={28}
                height={28}
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(85%) sepia(8%) saturate(138%) hue-rotate(138deg) brightness(93%) contrast(106%)",
                }}
              />
            ) : (
              "Vote"
            )}
          </Button>
          {transactionError && (
            <Alert variant="danger" className="mt-3 p-2">
              {transactionError}
            </Alert>
          )}
        </Stack>
        {success && (
          <Card
            className="bg-light mt-5 p-4 rounded-4 border-0"
            ref={successCardRef}
          >
            <Card.Text>Your ballot has been successfully submitted!</Card.Text>
            <Card.Text
              as="span"
              className="text-center"
              style={{ fontSize: 100 }}
            >
              &#x1F64F;
            </Card.Text>
            <Card.Text>
              Tell more builders and voters about the round.
            </Card.Text>
            <Stack direction="horizontal" className="justify-content-around">
              <Card.Link
                className="d-flex flex-column align-items-center twitter-share-button text-decoration-none fs-6 m-0 w-50"
                rel="noreferrer"
                target="_blank"
                data-size="large"
              >
                <Image
                  src="/x-logo.svg"
                  alt="x social"
                  width={28}
                  height={22}
                />
                <span style={{ fontSize: "10px" }}>Post to X</span>
              </Card.Link>
              <Card.Link
                className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
                rel="noreferrer"
                target="_blank"
              >
                <Image
                  src="/farcaster.svg"
                  alt="farcaster"
                  width={28}
                  height={22}
                />
                <span style={{ fontSize: "10px" }}>Cast to Farcaster</span>
              </Card.Link>
              <Card.Link
                className="d-flex flex-column align-items-center text-decoration-none fs-6 m-0 w-50"
                rel="noreferrer"
                target="_blank"
              >
                <Image src="/lens.svg" alt="lens" width={28} height={22} />
                <span style={{ fontSize: "10px" }}>Post on Lens</span>
              </Card.Link>
            </Stack>
          </Card>
        )}
      </Offcanvas.Body>
    </Offcanvas>
  );
}
