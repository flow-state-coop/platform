import { useRouter } from "next/router";
import { usePathname } from "next/navigation";
import ConnectWallet from "@/components/ConnectWallet";
import Nav from "react-bootstrap/Nav";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "../hooks/mediaQuery";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
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
            pathname.startsWith("/admin") ||
            pathname.startsWith("/grantee")
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
          width={isMobile ? 60 : 80}
          className="cursor-pointer"
          onClick={() => router.push("/")}
        />
        <ConnectWallet />
      </Stack>
    </Nav>
  );
}
