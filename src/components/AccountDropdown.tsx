import Image from "next/image";
import Link from "next/link";
import { useDisconnect } from "wagmi";
import Dropdown from "react-bootstrap/Dropdown";
import Stack from "react-bootstrap/Stack";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";

export default function AccountDropdown({
  fallbackDisplayName,
  hideNameOnMobile,
}: {
  fallbackDisplayName: string;
  hideNameOnMobile?: boolean;
}) {
  const { disconnect } = useDisconnect();
  const { isMobile } = useMediaQuery();
  const { displayName: profileDisplayName } = useProfileDisplayName();

  const nameElement = (
    <span className="fw-semi-bold sensitive">
      {profileDisplayName ?? fallbackDisplayName}
    </span>
  );

  return (
    <Dropdown align={{ md: "start" }}>
      <Dropdown.Toggle
        bsPrefix="dropdown"
        variant="outline-dark"
        className="d-flex align-items-center gap-1 px-10 py-4 border-4 rounded-4"
        style={{ whiteSpace: "nowrap" }}
      >
        <span
          className="icon-currentcolor"
          role="img"
          aria-label="account"
          style={{
            width: 18,
            height: 18,
            WebkitMaskImage: "url(/account-circle.svg)",
            maskImage: "url(/account-circle.svg)",
          }}
        />
        {(!hideNameOnMobile || !isMobile) && nameElement}
      </Dropdown.Toggle>
      <Dropdown.Menu className="py-0 border-4 border-dark overflow-hidden">
        <Link href="/profile" className="text-decoration-none">
          <Dropdown.Item as="span" className="p-3 fw-semi-bold text-dark">
            Profile
          </Dropdown.Item>
        </Link>
        <Link href="/projects" className="text-decoration-none">
          <Dropdown.Item as="span" className="p-3 fw-semi-bold text-dark">
            Projects
          </Dropdown.Item>
        </Link>
        <Dropdown.Item
          className="gap-2 p-3 fw-semi-bold text-dark"
          onClick={() => disconnect()}
        >
          <Stack direction="horizontal" gap={2} className="align-items-center">
            Disconnect
            <Image src="/logout.svg" alt="Disconnect" width={24} height={24} />
          </Stack>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
