import Stack from "react-bootstrap/Stack";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isMobile } = useMediaQuery();

  return (
    <Stack direction="vertical" style={{ minHeight: "100vh" }}>
      <Header />
      <Stack direction="horizontal" className="flex-grow-1">
        {!isMobile && (
          <Stack direction="vertical" className="w-25" style={{ flexGrow: 1 }}>
            <Sidebar />
          </Stack>
        )}
        <Stack direction="vertical" className={isMobile ? "w-100" : "w-75"}>
          {children}
        </Stack>
      </Stack>
    </Stack>
  );
}
