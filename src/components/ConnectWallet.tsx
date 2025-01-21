import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import { useMediaQuery } from "@/hooks/mediaQuery";
import WalletBalance from "@/components/WalletBalance";
import GithubRewardsButton from "@/components/GithubRewardsButton";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default function ConnectWallet() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { disconnect } = useDisconnect();
  const { isMobile } = useMediaQuery();

  const chainId = searchParams.get("chainId");

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
                    className="rounded-3 text-light shadow"
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
                    className="text-light shadow"
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
                    className="d-flex align-items-center gap-1 border rounded-3 shadow"
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
                  <Dropdown align={{ md: "start" }}>
                    <Dropdown.Toggle
                      bsPrefix="dropdown"
                      variant="transparent"
                      className="border rounded-3 shadow"
                    >
                      <Stack
                        direction="horizontal"
                        gap={isMobile ? 0 : 2}
                        className="align-items-center"
                      >
                        <Image
                          src="/account-circle.svg"
                          alt="Wallet"
                          width={isMobile ? 25 : 22}
                          height={isMobile ? 25 : 22}
                        />
                        <span className="sensitive">
                          {!isMobile && account.displayName}
                        </span>
                      </Stack>
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="py-0">
                      <Dropdown.Item
                        as="div"
                        className="py-3 rounded-top-1 text-dark"
                      >
                        <Link href="/projects" className="text-decoration-none">
                          Projects
                        </Link>
                      </Dropdown.Item>
                      <Dropdown.Item
                        as="div"
                        className="py-3 border-top rounded-bottom-1 text-dark"
                      >
                        <Link
                          href={`/flow-splitters/?chainId=${chain.id}`}
                          className="text-decoration-none"
                        >
                          Flow Splitters
                        </Link>
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
                  {pathname?.startsWith("/pay16z") && (
                    <GithubRewardsButton
                      chainId={chainId ? Number(chainId) : DEFAULT_CHAIN_ID}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
