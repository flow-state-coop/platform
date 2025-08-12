"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useRouter, usePathname, useParams } from "next/navigation";
import ConnectWallet from "@/components/ConnectWallet";
import FlowCouncilWallet from "@/app/flow-councils/components/FlowCouncilWallet";
import CreateCoinbaseWallet from "@/components/CreateCoinbaseWallet";
import Nav from "react-bootstrap/Nav";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Offcanvas from "react-bootstrap/Offcanvas";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function Header() {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { address } = useAccount();
  const { isMobile, isTablet } = useMediaQuery();

  return (
    <header className="w-100">
      <Nav>
        <Stack
          direction="horizontal"
          className="justify-content-between w-100 px-3 py-5 px-sm-12 px-xxl-16 py-sm-8"
        >
          <Stack direction="horizontal" gap={4} className="cursor-pointer">
            <Image
              src="/logo-dark.svg"
              alt="logo"
              width={isMobile || isTablet ? 48 : 64}
              height={isMobile || isTablet ? 48 : 64}
              onClick={() => router.push("/")}
            />
            <Image src="wordmark.svg" alt="Flow State" />
          </Stack>
          {isMobile && (
            <Button
              variant="outline-dark"
              className="ms-auto px-6 py-2 fs-lg fw-bold rounded-3 border-4"
              onClick={() => setShowMobileMenu(true)}
            >
              Menu
            </Button>
          )}
          {!isMobile && (
            <>
              <Stack direction="horizontal" gap={2}>
                <Button
                  variant="transparent"
                  className="px-10 py-4 fs-lg fw-bold"
                  onClick={() => router.push("/?for-orgs=true")}
                >
                  For orgs
                </Button>
                <Button
                  variant="transparent"
                  className="px-10 py-4 fs-lg fw-bold"
                  onClick={() => router.push("/?for-builders=true")}
                >
                  For builders
                </Button>
                <Button
                  variant="transparent"
                  className="px-10 py-4 fs-lg fw-bold"
                  onClick={() => router.push("/?for-everyone=true")}
                >
                  For everyone
                </Button>
              </Stack>
              <Stack direction="horizontal" gap={6}>
                <Stack
                  direction="horizontal"
                  gap={6}
                  className="justify-content-center"
                >
                  <Button
                    variant="link"
                    href="https://t.me/flowstatecoop"
                    target="_blank"
                    className="p-0"
                  >
                    <Image
                      src="/telegram.svg"
                      alt="Telegram"
                      width={40}
                      height={40}
                    />
                  </Button>
                  <Button
                    variant="link"
                    href="https://discord.gg/CF5cdk7z67"
                    target="_blank"
                    className="p-0"
                  >
                    <Image
                      src="/discord.svg"
                      alt="Discord"
                      width={40}
                      height={40}
                    />
                  </Button>
                </Stack>
                <Suspense>
                  {pathname === "/" ? (
                    <Link href="/explore">
                      <Button className="px-10 py-4 rounded-3 text-white fs-lg fw-bold">
                        Explore flows
                      </Button>
                    </Link>
                  ) : pathname === "/gooddollar" ||
                    (params.chainId && params.councilId) ? (
                    <FlowCouncilWallet />
                  ) : (
                    <ConnectWallet />
                  )}
                </Suspense>
                {pathname !== "/" && !address && !isMobile && (
                  <CreateCoinbaseWallet />
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Nav>
      <Offcanvas
        show={showMobileMenu}
        placement="bottom"
        onHide={() => setShowMobileMenu(false)}
        style={{ height: "100%" }}
      >
        <Offcanvas.Header className="justify-content-between px-3 py- px-3 py-5">
          <Stack direction="horizontal" gap={4} className="cursor-pointer">
            <Image
              src="/logo-dark.svg"
              alt="logo"
              width={48}
              height={48}
              onClick={() => router.push("/")}
            />
            <Image src="wordmark.svg" alt="Flow State" />
          </Stack>
          <Button
            variant="outline-dark"
            className="px-6 py-2 fs-lg fw-bold rounded-3 border-4"
            onClick={() => setShowMobileMenu(false)}
          >
            Close
          </Button>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column align-items-center gap-10 mt-20 px-8">
          <Button variant="transparent" className="px-10 py-4 fs-lg fw-bold">
            For orgs
          </Button>
          <Button variant="transparent" className="px-10 py-4 fs-lg fw-bold">
            For builders
          </Button>
          <Button variant="transparent" className="px-10 py-4 fs-lg fw-bold">
            For everyone
          </Button>
          <Stack
            direction="horizontal"
            gap={6}
            className="justify-content-center"
          >
            <Button
              variant="link"
              href="https://t.me/flowstatecoop"
              target="_blank"
              className="p-0"
            >
              <Image
                src="/telegram.svg"
                alt="Telegram"
                width={40}
                height={40}
              />
            </Button>
            <Button
              variant="link"
              href="https://discord.gg/CF5cdk7z67"
              target="_blank"
              className="p-0"
            >
              <Image src="/discord.svg" alt="Discord" width={40} height={40} />
            </Button>
          </Stack>
          <Suspense>
            {pathname === "/" ? (
              <Link className="w-100" href="/explore">
                <Button className="w-100 px-10 py-4 rounded-3 text-white fs-lg fw-bold">
                  Explore flows
                </Button>
              </Link>
            ) : pathname === "/gooddollar" ||
              (params.chainId && params.councilId) ? (
              <FlowCouncilWallet />
            ) : (
              <ConnectWallet />
            )}
          </Suspense>
        </Offcanvas.Body>
      </Offcanvas>
    </header>
  );
}
