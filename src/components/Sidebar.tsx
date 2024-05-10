import Stack from "react-bootstrap/Stack";
import { usePathname } from "next/navigation";
import Link from "next/link";

function Sidebar() {
  const pathname = usePathname();

  return (
    <Stack direction="vertical" gap={4} className="h-100 py-4 px-3 fs-5 shadow">
      <Link href="/" className={pathname === "/" ? "fw-bold" : ""}>
        Program Selection
      </Link>
      <Link
        href="/pools"
        className={pathname.startsWith("/pools") ? "fw-bold" : ""}
      >
        Pool Selection
      </Link>
      <Link
        href="/configure"
        className={pathname.startsWith("/configure") ? "fw-bold" : ""}
      >
        Configuration
      </Link>
      <Link
        href="/review"
        className={pathname.startsWith("/review") ? "fw-bold" : ""}
      >
        Grantee Review
      </Link>
      <Link
        href="/distribute"
        className={pathname.startsWith("/distribute") ? "fw-bold" : ""}
      >
        Matching Funds
      </Link>
    </Stack>
  );
}

export default Sidebar;
