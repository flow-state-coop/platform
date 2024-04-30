import Stack from "react-bootstrap/Stack";
import Link from "next/Link";

function Sidebar() {
  return (
    <Stack direction="vertical" gap={4} className="h-100 py-4 px-3 fs-5 shadow">
      <Link href="/" className="fw-bold">Program Selection</Link>
      <Link href="/">Pool Selection</Link>
      <Link href="/">Configuration</Link>
      <Link href="/">Grantee Review</Link>
      <Link href="/">Matching Funds</Link>
    </Stack>
  );
}

export default Sidebar;
