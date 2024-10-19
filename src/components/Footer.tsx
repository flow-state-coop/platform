import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";

export default function Footer() {
  return (
    <footer
      className="d-flex flex-column align-items-center p-2"
      style={{ boxShadow: "0 -0.5rem 1rem rgba(0,0,0,0.2)" }}
    >
      <Stack
        direction="horizontal"
        gap={3}
        className="m-auto align-items-center"
      >
        <Button
          variant="link"
          href="https://docs.flowstate.network"
          target="_blank"
          className="p-2"
        >
          <Image src="/docs.svg" alt="Docs" width={35} height={35} />
        </Button>
        <Button
          variant="link"
          href="https://github.com/flow-state-coop"
          target="_blank"
          className="p-2"
        >
          <Image src="/github.svg" alt="Github" width={25} height={25} />
        </Button>
        <Button
          variant="link"
          href="https://twitter.com/flowstatecoop"
          target="_blank"
          className="p-2"
        >
          <Image src="/x-logo.svg" alt="Twitter" width={24} height={24} />
        </Button>
        <Button
          variant="link"
          href="https://t.me/flowstatecoop"
          target="_blank"
          className="p-2"
        >
          <Image src="/telegram.svg" alt="Telegram" width={28} height={28} />
        </Button>
      </Stack>
      <Stack direction="horizontal" gap={5} className="mx-auto mt-1 mb-3">
        <Link href="/terms" className="text-center">
          Terms of Use
        </Link>
        <Link href="/privacy" className="text-center">
          Privacy Policy
        </Link>
      </Stack>
      <p className="m-0 small">Flow State LCA - &#169; 2024</p>
    </footer>
  );
}
