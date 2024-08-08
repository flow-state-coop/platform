import { ConnectButton } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Image from "next/image";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function ConnectWallet() {
  const { isMobile } = useMediaQuery();

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
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
                  <Button onClick={openConnectModal} className="rounded-3">
                    Connect Wallet
                  </Button>
                );
              }
              if (chain.unsupported) {
                return (
                  <Button
                    variant="danger"
                    onClick={openChainModal}
                    type="button"
                  >
                    Wrong network
                  </Button>
                );
              }

              return (
                <div style={{ display: "flex", gap: 12 }}>
                  {!isMobile && (
                    <Button
                      variant="transparent"
                      onClick={openChainModal}
                      className="d-flex align-items-center gap-1 border rounded-3"
                    >
                      {chain.iconUrl && (
                        <Image
                          alt={chain.name ?? "Chain icon"}
                          src={chain.iconUrl}
                          width={14}
                          height={14}
                        />
                      )}
                      {chain.name}
                    </Button>
                  )}
                  <Button
                    variant="transparent"
                    onClick={openAccountModal}
                    className="border rounded-3"
                  >
                    {account.displayName}
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
