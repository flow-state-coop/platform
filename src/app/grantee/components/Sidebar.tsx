"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";

function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const poolId = searchParams?.get("poolId");
  const chainId = Number(searchParams?.get("chainId")) ?? null;

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="h-100 py-4 px-3 fs-5"
      style={{ boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)" }}
    >
      <Link
        href={`/grantee/?chainId=${chainId}&poolId=${poolId}`}
        className={`${pathname === "/grantee" ? "fw-bold" : ""} text-decoration-none`}
        style={{
          pointerEvents: !chainId || !poolId ? "none" : "auto",
        }}
      >
        Pool Application
      </Link>
      <Link
        href={`/grantee/tools/?chainId=${chainId}&poolId=${poolId}`}
        className={`${pathname === "/grantee/tools" ? "fw-bold" : ""} text-decoration-none`}
        style={{
          pointerEvents: !chainId || !poolId ? "none" : "auto",
        }}
      >
        Grantee Tools
      </Link>
    </Stack>
  );
}

export default Sidebar;
