"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";

function Sidebar() {
  const pathname = usePathname();

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="h-100 py-4 px-3 fs-5"
      style={{ boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)" }}
    >
      <Link
        href={`/flow-councils/launch`}
        className={`${pathname === "/flow-councils/launch" ? "fw-bold" : ""} text-decoration-none`}
      >
        Launch Config
      </Link>
    </Stack>
  );
}

export default Sidebar;
