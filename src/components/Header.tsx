import { ConnectButton } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Navbar from "react-bootstrap/Navbar";
import { useMediaQuery } from "../hooks/mediaQuery";

export default function Header() {
  const { isMobile } = useMediaQuery();

  return (
    <Stack
      direction="horizontal"
      className="justify-content-between w-100 px-5 shadow"
    >
      <Image src="/logo.svg" alt="logo" width={isMobile ? 60 : 80} />
      <ConnectButton
        accountStatus="address"
        chainStatus="icon"
        showBalance={false}
      />
    </Stack>
  );
}
