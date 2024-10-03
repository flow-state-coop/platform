import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "next/image";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { usePathname } from "next/navigation";
import WalletBalance from "@/components/WalletBalance";

export default function ConnectWallet() {
  const pathname = usePathname();
  const { disconnect } = useDisconnect();
  const { isMobile } = useMediaQuery();

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
                    className="rounded-3 text-light"
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
                    className="text-light"
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
                    className="d-flex align-items-center gap-1 border rounded-3"
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
                  {pathname?.startsWith("/pool") && <WalletBalance />}
                  <Dropdown>
                    <Dropdown.Toggle
                      bsPrefix="dropdown"
                      variant="transparent"
                      className="border rounded-3"
                    >
                      <Stack
                        direction="horizontal"
                        gap={2}
                        className="align-items-center"
                      >
                        <Image
                          src="/account-circle.svg"
                          alt="Wallet"
                          width={isMobile ? 25 : 22}
                          height={isMobile ? 25 : 22}
                        />
                        {!isMobile && account.displayName}
                      </Stack>
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="py-0">
                      <Dropdown.Item className="py-3 rounded-top-1 text-dark">
                        <Link href="/projects">Projects</Link>
                      </Dropdown.Item>
                      <Dropdown.Item
                        className="gap-2 py-3 border-top rounded-bottom-1 text-dark"
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
                            width={18}
                            height={18}
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
