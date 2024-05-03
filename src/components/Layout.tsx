import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Stack from "react-bootstrap/Stack";
import Header from "./Header";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Stack direction="vertical" style={{ minHeight: "100vh" }}>
      <Header />
      <Stack direction="horizontal" className="flex-grow-1">
        <Stack direction="vertical" className="w-25" style={{ flexGrow: 1 }}>
          <Sidebar />
        </Stack>
        <Stack direction="vertical" className="w-75">
          {children}
        </Stack>
      </Stack>
    </Stack>
  );
}
