import { useState, useRef, useEffect } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import FormControl from "react-bootstrap/FormControl";
import useFlowCouncil from "../hooks/flowCouncil";
import useWriteBallot from "../hooks/writeBallot";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { isNumber } from "@/lib/utils";

export default function Ballot({
  flowCouncilAddress,
}: {
  flowCouncilAddress: `0x${string}`;
}) {
  const [success, setSuccess] = useState(false);

  const successCardRef = useRef<HTMLDivElement>(null);

  const {
    flowCouncil,
    voter,
    currentBallot,
    newBallot,
    flowStateProfiles,
    dispatchShowBallot,
    dispatchNewBallot,
  } = useFlowCouncil();
  const { isMobile } = useMediaQuery();
  const { vote, isVoting, transactionError } =
    useWriteBallot(flowCouncilAddress);

  const votingPower = voter?.votingPower ?? 0;
  const totalVotes =
    newBallot?.ballot?.map((vote) => vote.amount)?.reduce((a, b) => a + b, 0) ??
    0;
  const newVotesCount = newBallot?.ballot?.length ?? 0;
  const maxVotingSpread = flowCouncil?.maxVotingSpread ?? 0;

  useEffect(() => {
    if (success) {
      if (successCardRef.current) {
        successCardRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [success]);

  const handleAmountStepping = (args: {
    increment: boolean;
    recipientIndex: number;
  }) => {
    const { increment, recipientIndex } = args;

    const recipientAddress = newBallot?.ballot[recipientIndex].recipient;
    const currentAmount = newBallot?.ballot[recipientIndex].amount ?? 0;

    if (recipientAddress) {
      const newAmount = increment
        ? currentAmount + 1
        : currentAmount - 1 < 0
          ? 0
          : currentAmount - 1;

      setSuccess(false);
      dispatchNewBallot({
        type: "update",
        ballot: { recipient: recipientAddress, amount: newAmount },
      });
    }
  };

  const handleAmountSelection = (
    e: React.ChangeEvent<HTMLInputElement>,
    recipientIndex: number,
  ) => {
    const { value } = e.target;

    const recipientAddress = newBallot?.ballot[recipientIndex].recipient;

    if (isNumber(value) && recipientAddress) {
      dispatchNewBallot({
        type: "update",
        ballot: { recipient: recipientAddress, amount: Number(value) },
      });

      setSuccess(false);
    } else if (value === "" && recipientAddress) {
      dispatchNewBallot({
        type: "update",
        ballot: { recipient: recipientAddress, amount: 0 },
      });

      setSuccess(false);
    }
  };

  const handleVote = async () => {
    if (newBallot && newBallot?.ballot.length > 0) {
      const currentVotes = currentBallot?.ballot ?? [];
      const newVotes = newBallot?.ballot ?? [];
      const votesToRemove = currentVotes.filter(
        (currentVote) =>
          !newVotes
            .map((newVote) => newVote.recipient)
            .includes(currentVote.recipient),
      );
      const receipt = await vote(
        newBallot.ballot.concat(
          votesToRemove.map((vote) => {
            return { ...vote, amount: 0 };
          }),
        ),
      );

      if (receipt?.status === "success") {
        setSuccess(true);
      }
    }
  };

  return (
    <Offcanvas
      show
      onHide={() => {
        const zeroVotes = newBallot?.ballot.filter((vote) => vote.amount === 0);

        if (zeroVotes) {
          for (const ballot of zeroVotes) {
            dispatchNewBallot({
              type: "delete",
              ballot,
            });
          }
        }

        dispatchShowBallot({ type: "hide" });
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
            className={`m-0 fs-6 ${newVotesCount > maxVotingSpread ? "text-danger" : "text-info"}`}
            style={{
              visibility: maxVotingSpread === 0 ? "hidden" : "visible",
            }}
          >
            ({newBallot?.ballot?.length ?? 0}/{maxVotingSpread} Projects)
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
          {newBallot?.ballot?.map((ballot, i) => {
            const flowCouncilRecipient = flowCouncil?.recipients.find(
              (recipient) => recipient.account === ballot.recipient,
            );
            const profile = flowStateProfiles?.find(
              (profile) => profile.id === flowCouncilRecipient?.metadata,
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
                      dispatchNewBallot({
                        type: "delete",
                        ballot,
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
                        recipientIndex: i,
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
                    value={ballot.amount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleAmountSelection(e, i)
                    }
                    className="text-center w-33 bg-white border-black border-start-0 border-end-0 rounded-0 shadow-none"
                  />
                  <Button
                    variant="white"
                    className="d-flex justify-content-center align-items-center w-25 bg-info border-black border-start-0 rounded-0 rounded-end-3 fs-4 px-1 py-2"
                    onClick={() =>
                      handleAmountStepping({
                        increment: true,
                        recipientIndex: i,
                      })
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
                (maxVotingSpread && newVotesCount > maxVotingSpread) ||
                !newBallot?.ballot ||
                newBallot.ballot.length === 0 ||
                JSON.stringify(currentBallot?.ballot) ===
                  JSON.stringify(newBallot?.ballot))
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
