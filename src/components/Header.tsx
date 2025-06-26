"use client";

import { Suspense } from "react";
import { useAccount } from "wagmi";
import { useRouter, usePathname, useParams } from "next/navigation";
import ConnectWallet from "@/components/ConnectWallet";
import FlowCouncilWallet from "@/app/flow-councils/components/FlowCouncilWallet";
import CreateCoinbaseWallet from "@/components/CreateCoinbaseWallet";
import Nav from "react-bootstrap/Nav";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { address } = useAccount();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();

  return (
    <Nav className="w-100 shadow">
      <Stack
        direction="horizontal"
        className="justify-content-between mx-auto px-4"
        style={{
          minWidth:
            isMobile ||
            isTablet ||
            pathname?.startsWith("/sqf") ||
            pathname?.startsWith("/flow-councils/launch") ||
            pathname?.startsWith("/flow-councils/membership") ||
            pathname?.startsWith("/flow-councils/review") ||
            pathname?.startsWith("/gooddollar/launch") ||
            pathname?.startsWith("/gooddollar/membership") ||
            pathname?.startsWith("/gooddollar/review") ||
            pathname?.startsWith("/grantee") ||
            pathname?.startsWith("/flow-guilds") ||
            pathname?.startsWith("/terms") ||
            pathname?.startsWith("/privacy") ||
            pathname?.startsWith("/conduct")
              ? "100%"
              : isSmallScreen
                ? 1000
                : isMediumScreen
                  ? 1300
                  : 1600,
          maxWidth: 1600,
        }}
      >
        <Image
          src="/logo.png"
          alt="logo"
          width={80}
          height={80}
          className="cursor-pointer"
          onClick={() => router.push("/")}
        />
        <Stack direction="horizontal" gap={3}>
          <Suspense>
            {pathname === "/gooddollar" ||
            (params.chainId && params.councilId) ? (
              <FlowCouncilWallet />
            ) : (
              <ConnectWallet />
            )}
          </Suspense>
          {!address && !isMobile && <CreateCoinbaseWallet />}
        </Stack>
      </Stack>
    </Nav>
  );
}
