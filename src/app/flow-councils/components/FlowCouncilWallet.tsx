import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import Link from "next/link";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Badge from "react-bootstrap/Badge";
import Image from "next/image";
import ConnectWallet from "@/components/ConnectWallet";
import useFlowCouncil from "../hooks/flowCouncil";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";

export default function FlowCouncilWallet({
  onConnect,
}: {
  onConnect?: () => void;
}) {
  const { councilMember, currentBallot, newBallot, dispatchShowBallot } =
    useFlowCouncil();
  const { isMobile, isSmallScreen } = useMediaQuery();
  const { disconnect } = useDisconnect();
  const { displayName: profileDisplayName } = useProfileDisplayName();

  const currentVotes =
    newBallot?.votes?.map((a) => a.amount)?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <>
      {councilMember ? (
        <ConnectButton.Custom>
          {({ account, chain, openChainModal, openConnectModal, mounted }) => {
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
                        onClick={() => {
                          onConnect?.();
                          openConnectModal();
                        }}
                        className="px-10 py-4 rounded-4 fw-semi-bold text-light shadow"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {isSmallScreen ? "Connect" : "Connect Wallet"}
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
                        variant="outline-dark"
                        onClick={openChainModal}
                        className="d-flex align-items-center gap-1 px-5 py-2 border-4 rounded-4"
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
                        variant="outline-dark"
                        className="d-flex align-items-center gap-1 px-10 py-4 border-4 rounded-4 fw-semi-bold"
                        style={{ whiteSpace: "nowrap" }}
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
                      <Dropdown align={{ md: "start" }}>
                        <Dropdown.Toggle
                          bsPrefix="dropdown"
                          variant="outline-dark"
                          className="d-flex align-items-center gap-1 px-10 py-4 border-4 rounded-4"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          <span
                            className="icon-currentcolor"
                            role="img"
                            aria-label="account"
                            style={{
                              width: 18,
                              height: 18,
                              WebkitMaskImage: "url(/account-circle.svg)",
                              maskImage: "url(/account-circle.svg)",
                            }}
                          />
                          {!isMobile && (
                            <span className="fw-semi-bold sensitive">
                              {profileDisplayName ?? account.displayName}
                            </span>
                          )}
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="py-0 border-4 border-dark overflow-hidden">
                          <Link
                            href="/profile"
                            className="text-decoration-none"
                          >
                            <Dropdown.Item
                              as="span"
                              className="p-3 fw-semi-bold text-dark"
                            >
                              Profile
                            </Dropdown.Item>
                          </Link>
                          <Link
                            href="/projects"
                            className="text-decoration-none"
                          >
                            <Dropdown.Item
                              as="span"
                              className="p-3 fw-semi-bold text-dark"
                            >
                              Projects
                            </Dropdown.Item>
                          </Link>
                          <Dropdown.Item
                            className="gap-2 p-3 fw-semi-bold text-dark"
                            onClick={() => disconnect()}
                          >
                            <Stack
                              direction="horizontal"
                              gap={2}
                              className="align-items-center"
                            >
                              Disconnect
                              <Image
                                src="/logout.svg"
                                alt="Disconnect"
                                width={24}
                                height={24}
                              />
                            </Stack>
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>
                  );
                })()}
              </div>
            );
          }}
        </ConnectButton.Custom>
      ) : (
        <ConnectWallet onConnect={onConnect} />
      )}
    </>
  );
}
