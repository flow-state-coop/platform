import Stack from "react-bootstrap/Stack";
import { usePathname } from "next/navigation";
import Link from "next/link";
import useAdminParams from "@/hooks/adminParams";

function Sidebar() {
  const pathname = usePathname();
  const { profileId, poolId } = useAdminParams();

  return (
    <Stack direction="vertical" gap={4} className="h-100 py-4 px-3 fs-5 shadow">
      <Link href="/" className={pathname === "/" ? "fw-bold" : ""}>
        Program Selection
      </Link>
      <Link
        href="/pools"
        className={pathname.startsWith("/pools") ? "fw-bold" : ""}
        style={{
          color: profileId ? "" : "gray",
          pointerEvents: profileId ? "auto" : "none",
        }}
      >
        Pool Selection
      </Link>
      <Link
        href="/configure"
        className={pathname.startsWith("/configure") ? "fw-bold" : ""}
        style={{
          color: profileId ? "" : "gray",
          pointerEvents: profileId ? "auto" : "none",
        }}
      >
        Configuration
      </Link>
      <Link
        href="/review"
        className={pathname.startsWith("/review") ? "fw-bold" : ""}
        style={{
          color: poolId ? "" : "gray",
          pointerEvents: poolId ? "auto" : "none",
        }}
      >
        Grantee Review
      </Link>
      <Link
        href="/distribute"
        className={pathname.startsWith("/distribute") ? "fw-bold" : ""}
        style={{
          color: poolId ? "" : "gray",
          pointerEvents: poolId ? "auto" : "none",
        }}
      >
        Matching Funds
      </Link>
    </Stack>
  );
}

export default Sidebar;
