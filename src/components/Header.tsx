import { useRouter } from "next/router";
import ConnectWallet from "@/components/ConnectWallet";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "../hooks/mediaQuery";

export default function Header() {
  const router = useRouter();
  const { isMobile } = useMediaQuery();

  return (
    <Stack
      direction="horizontal"
      className="justify-content-between w-100 px-5 shadow"
    >
      <Image
        src="/logo.svg"
        alt="logo"
        width={isMobile ? 60 : 80}
        className="cursor-pointer"
        onClick={() => router.push("/")}
      />
      <ConnectWallet />
    </Stack>
  );
}
