"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { http } from "viem";
import {
  connectorsForWallets,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  walletConnectWallet,
  injectedWallet,
  baseAccount,
  safeWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, WagmiProvider, useAccount } from "wagmi";
import { arbitrum, base, celo, optimism, optimismSepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { DonorParamsContextProvider } from "@/context/DonorParams";
import { FlowCouncilContextProvider } from "@/context/FlowCouncil";
import ConsentGate from "@/components/ConsentGate";
import useSiwe from "@/hooks/siwe";
import { networks } from "@/lib/networks";
import { WALLET_CONNECT_PROJECT_ID, DEFAULT_CHAIN_ID } from "@/lib/constants";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles.scss";

const chains = [arbitrum, base, celo, optimism, optimismSepolia] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        walletConnectWallet,
        injectedWallet,
        baseAccount,
        safeWallet,
        rainbowWallet,
      ],
    },
  ],
  { appName: "Flow State", projectId: WALLET_CONNECT_PROJECT_ID },
);

const config = createConfig({
  connectors,
  chains,
  ssr: true,
  transports: {
    [arbitrum.id]: http(
      networks.find((network) => network.id === arbitrum.id)!.rpcUrl,
    ),
    [base.id]: http(networks.find((network) => network.id === base.id)!.rpcUrl),
    [celo.id]: http(networks.find((network) => network.id === celo.id)!.rpcUrl),
    [optimism.id]: http(
      networks.find((network) => network.id === optimism.id)!.rpcUrl,
    ),
    [optimismSepolia.id]: http(
      networks.find((network) => network.id === optimismSepolia.id)!.rpcUrl,
    ),
  },
});

const queryClient = new QueryClient();

function useInitialChain() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const searchChainId = searchParams.get("chainId");

    if (
      (segments[0] === "flow-councils" || segments[0] === "flow-splitters") &&
      segments[1] === "launch" &&
      segments[2] &&
      !isNaN(Number(segments[2]))
    ) {
      return Number(segments[2]);
    }

    if (
      (segments[0] === "flow-councils" || segments[0] === "flow-splitters") &&
      segments[1] &&
      segments[1] !== "launch" &&
      !isNaN(Number(segments[1]))
    ) {
      return Number(segments[1]);
    }

    if (searchChainId && !isNaN(Number(searchChainId))) {
      return Number(searchChainId);
    }

    if (segments[0] === "flow-councils") {
      return celo.id;
    }

    return DEFAULT_CHAIN_ID;
  }, [pathname, searchParams]);
}

function RainbowKitWithInitialChain({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialChain = useInitialChain();

  return (
    <RainbowKitProvider modalSize="compact" initialChain={initialChain}>
      {children}
    </RainbowKitProvider>
  );
}

// Bound the wallet-switch sign-out retries so a sustained NextAuth outage
// can't trap the user in an endless sign-out → reload loop.
const SIGNOUT_ATTEMPTS_KEY = "wallet-switch-signout-attempts";
const MAX_SIGNOUT_ATTEMPTS = 2;

function AuthSync() {
  const { address, isDisconnected } = useAccount();
  const { data: session } = useSession();
  const reloadingRef = useRef(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    if (!session?.address) return;

    // Wallet fully disconnected — drop the stale session. No reload needed;
    // the UI falls back to the connect / sign-in prompt.
    if (isDisconnected) {
      signOut({ redirect: false });
      return;
    }

    // Wallet switched to a different account while signed in. The session
    // still belongs to the previous address, so sign out and reload the page
    // to rebuild all wallet-scoped state and require a fresh SIWE.
    if (address && address.toLowerCase() !== session.address.toLowerCase()) {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      signOut({ redirect: false })
        .then(() => {
          // Signed out cleanly — the stale cookie is gone, so the reload
          // won't re-detect the mismatch. Clear the retry counter.
          sessionStorage.removeItem(SIGNOUT_ATTEMPTS_KEY);
          window.location.reload();
        })
        .catch(() => {
          // signOut rejected (e.g. the NextAuth endpoint is down). The stale
          // cookie survives, so a reload re-detects the same mismatch and we
          // retry — which loops forever on a sustained outage. Bound it:
          // reload to ride out a transient blip, but after MAX_SIGNOUT_ATTEMPTS
          // consecutive failures stop and surface an error instead.
          const attempts =
            Number(sessionStorage.getItem(SIGNOUT_ATTEMPTS_KEY) ?? "0") + 1;
          if (attempts < MAX_SIGNOUT_ATTEMPTS) {
            sessionStorage.setItem(SIGNOUT_ATTEMPTS_KEY, String(attempts));
            window.location.reload();
          } else {
            sessionStorage.removeItem(SIGNOUT_ATTEMPTS_KEY);
            reloadingRef.current = false;
            setSignOutFailed(true);
          }
        });
    }
  }, [address, isDisconnected, session]);

  if (signOutFailed) {
    return (
      <Alert
        variant="warning"
        className="position-fixed top-0 start-50 translate-middle-x mt-3 shadow"
        style={{ zIndex: 2000, maxWidth: "90vw" }}
      >
        Your connected wallet changed, but we couldn&apos;t refresh your
        session.{" "}
        <Alert.Link
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.location.reload();
          }}
        >
          Reload the page
        </Alert.Link>{" "}
        to sign in again.
      </Alert>
    );
  }

  return null;
}

// Prompt for SIWE automatically the first time a wallet connects, so users land
// authenticated without having to hunt for a button. The manual "Sign In With
// Ethereum" buttons remain as a backup (e.g. if the user dismisses this prompt).
// We prompt at most once per connected address per page load.
function AutoSiwe() {
  const { address, chain, isConnected } = useAccount();
  const { status } = useSession();
  const { handleSignIn } = useSiwe();
  const promptedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    // No wallet connected — reset so a later (re)connect prompts again.
    if (!isConnected || !address) {
      promptedAddressRef.current = null;
      return;
    }
    // Wait until the chain and the session state are known before deciding.
    if (!chain || status === "loading") return;
    // Already signed in. During a wallet switch the session still belongs to the
    // previous address; AuthSync handles that case (sign out + reload), so we
    // stay out of its way here.
    if (status === "authenticated") return;
    // Only auto-prompt once per address; a rejection falls back to the buttons.
    if (promptedAddressRef.current === address) return;

    promptedAddressRef.current = address;
    handleSignIn();
  }, [address, chain, isConnected, status, handleSignIn]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: "identified_only",
      persistence: "memory",
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      session_recording: {
        maskTextSelector: ".sensitive",
      },
    });
  }, []);

  return (
    <Suspense>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <AuthSync />
            <AutoSiwe />
            <ConsentGate />
            <RainbowKitWithInitialChain>
              <PostHogProvider client={posthog}>
                <DonorParamsContextProvider>
                  <FlowCouncilContextProvider>
                    {children}
                  </FlowCouncilContextProvider>
                </DonorParamsContextProvider>
              </PostHogProvider>
            </RainbowKitWithInitialChain>
          </SessionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Suspense>
  );
}
