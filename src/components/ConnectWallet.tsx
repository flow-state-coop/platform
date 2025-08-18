import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import WalletDashboard from "@/components/WalletDashboard";

export default function ConnectWallet() {
  const pathname = usePathname();
  const { disconnect } = useDisconnect();

  return (
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
                    onClick={openConnectModal}
                    className="border-4 rounded-4 px-10 py-4 fs-lg fw-semi-bold"
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
                    className="rounded-4 px-10 py-4 fs-lg fw-semi-bold"
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
                        width={24}
                        height={24}
                      />
                    )}
                  </Button>
                  {pathname?.startsWith("/pool") && <WalletDashboard />}
                  <Dropdown align={{ md: "start" }}>
                    <Dropdown.Toggle
                      bsPrefix="dropdown"
                      variant="outline-dark"
                      className="px-10 py-4 border-4 rounded-4"
                    >
                      <span className="fw-semi-bold sensitive">
                        {account.displayName}
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="py-0 border-4 border-dark">
                      <Link href="/projects" className="text-decoration-none">
                        <Dropdown.Item className="p-3 rounded-top-2 fw-semi-bold text-dark">
                          Projects
                        </Dropdown.Item>
                      </Link>
                      <Link
                        href={`/flow-splitters/?chainId=${chain.id}`}
                        className="text-decoration-none"
                      >
                        <Dropdown.Item className="p-3 rounded-bottom-2 fw-semi-bold text-dark">
                          Flow Splitters
                        </Dropdown.Item>
                      </Link>
                      <Dropdown.Item
                        className="gap-2 p-3 rounded-bottom-2 fw-semi-bold text-dark"
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
  );
}
