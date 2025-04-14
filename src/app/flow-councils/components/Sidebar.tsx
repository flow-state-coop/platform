"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import { getApolloClient } from "@/lib/apollo";

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String!) {
    council(id: $councilId) {
      id
    }
  }
`;

function Sidebar() {
  const searchParams = useSearchParams();
  const chainId = Number(searchParams?.get("chainId")) ?? null;
  const councilId = searchParams?.get("councilId");
  const pathname = usePathname();
  const { data: councilQueryRes } = useQuery(COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      chainId,
      councilId: councilId?.toLowerCase(),
    },
    skip: !councilId,
    pollInterval: 10000,
  });
  const council = councilQueryRes?.council ?? null;

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="h-100 py-4 px-3 fs-5"
      style={{ boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)" }}
    >
      <Link
        href={
          chainId && council?.id
            ? `/flow-councils/launch/?chainId=${chainId}&councilId=${council.id}`
            : "/flow-councils/launch"
        }
        className={`${pathname === "/flow-councils/launch" ? "fw-bold" : ""} text-decoration-none`}
      >
        Launch Config
      </Link>
      <Link
        href={`/flow-councils/membership/?chainId=${chainId}&councilId=${council?.id}`}
        className={`${pathname === "/flow-councils/membership" ? "fw-bold" : ""} text-decoration-none`}
      >
        Council Membership
      </Link>
    </Stack>
  );
}

export default Sidebar;
