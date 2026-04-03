import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { networks } from "@/lib/networks";
import { useMediaQuery } from "@/hooks/mediaQuery";
import Button from "react-bootstrap/Button";
import AccountDropdown from "@/components/AccountDropdown";

export default function ConnectWallet({
  onConnect,
}: {
  onConnect?: () => void;
}) {
  const { isSmallScreen } = useMediaQuery();

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
                    onClick={() => {
                      onConnect?.();
                      openConnectModal();
                    }}
                    className="border-4 rounded-4 px-10 py-4 fs-lg fw-semi-bold"
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
                    {(() => {
                      const iconUrl =
                        networks.find((n) => n.id === chain.id)?.icon ??
                        chain.iconUrl;
                      return (
                        iconUrl && (
                          <Image
                            alt={chain.name ?? "Chain icon"}
                            src={iconUrl}
                            width={24}
                            height={24}
                          />
                        )
                      );
                    })()}
                  </Button>
                  <AccountDropdown fallbackDisplayName={account.displayName} />
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
