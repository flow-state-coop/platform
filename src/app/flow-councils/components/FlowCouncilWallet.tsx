import { ConnectButton } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Badge from "react-bootstrap/Badge";
import Image from "next/image";
import ConnectWallet from "@/components/ConnectWallet";
import useFlowCouncil from "../hooks/flowCouncil";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function FlowCouncilWallet() {
  const { councilMember, currentBallot, newBallot, dispatchShowBallot } =
    useFlowCouncil();
  const { isMobile } = useMediaQuery();

  const currentVotes =
    newBallot?.votes?.map((a) => a.amount)?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <>
      {councilMember ? (
        <ConnectButton.Custom>
          {({
            account,
            chain,
            openChainModal,
            openConnectModal,
            openAccountModal,
            mounted,
          }) => {
            const connected = mounted && account && chain;

            return (
              <div
                {...(!mounted && {
                  "aria-hidden": true,
                  style: {
                    opacity: 0,
                    pointerEvents: "none",
                    userSelect: "none",
                  },
                })}
              >
                {(() => {
                  if (!connected) {
                    return (
                      <Button
                        onClick={openConnectModal}
                        className="px-10 py-4 rounded-4 fw-semi-bold text-light shadow"
                      >
                        Connect Wallet
                      </Button>
                    );
                  }

                  if (chain.unsupported) {
                    return (
                      <Button
                        variant="danger"
                        onClick={openChainModal}
                        className="text-light shadow rounded-4 fw-semi-bold px-10 py-4"
                      >
                        Wrong network
                      </Button>
                    );
                  }

                  return (
                    <div style={{ display: "flex", gap: 12 }}>
                      <Button
                        variant="transparent"
                        onClick={openChainModal}
                        className="d-flex align-items-center gap-1 border rounded-4 border border-4 border-dark p-4 shadow"
                      >
                        {chain.iconUrl && (
                          <Image
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            width={20}
                            height={20}
                          />
                        )}
                      </Button>
                      <Button
                        variant="transparent"
                        className="d-flex align-items-center gap-1 py-4 border border-4 border-dark rounded-4 fw-semi-bold shadow"
                        onClick={() => dispatchShowBallot({ type: "show" })}
                      >
                        {newBallot?.votes &&
                        newBallot.votes.length > 0 &&
                        JSON.stringify(currentBallot?.votes) !==
                          JSON.stringify(newBallot?.votes) ? (
                          <Stack direction="horizontal" gap={2}>
                            <Badge className="p-1 bg-danger rounded-circle">
                              <Image
                                src="/ballot.svg"
                                alt="wallet"
                                width={16}
                                height={16}
                                style={{
                                  filter:
                                    "invert(99%) sepia(38%) saturate(0%) hue-rotate(79deg) brightness(110%) contrast(101%)",
                                }}
                              />
                            </Badge>
                            {isMobile ? "" : "Vote"}
                          </Stack>
                        ) : (
                          <>
                            <Image
                              src="/ballot.svg"
                              alt="wallet"
                              width={18}
                              height={18}
                            />
                            {isMobile ? (
                              ""
                            ) : councilMember ? (
                              <>
                                {councilMember.votingPower - currentVotes > 0
                                  ? councilMember.votingPower - currentVotes
                                  : 0}{" "}
                                Votes
                              </>
                            ) : (
                              <Spinner size="sm" />
                            )}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="transparent"
                        className="d-flex align-items-center gap-1 py-4 border border-4 border-dark fw-semi-bold rounded-4 shadow"
                        onClick={openAccountModal}
                      >
                        <Image
                          src="/account-circle.svg"
                          alt="account"
                          width={18}
                          height={18}
                        />
                        {!isMobile && account.displayName
                          ? account.displayName
                          : ""}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            );
          }}
        </ConnectButton.Custom>
      ) : (
        <ConnectWallet />
      )}
    </>
  );
}
