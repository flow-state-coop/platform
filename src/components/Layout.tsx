import { usePathname } from "next/navigation";
import Stack from "react-bootstrap/Stack";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const pathname = usePathname();
  const { isMobile } = useMediaQuery();

  return (
    <Stack direction="vertical" style={{ minHeight: "100vh" }}>
      <Header />
      <Stack direction="horizontal" className="flex-grow-1">
        {!isMobile && pathname !== "/" && (
          <Stack direction="vertical" className="w-25" style={{ flexGrow: 1 }}>
            <Sidebar />
          </Stack>
        )}
        <Stack
          direction="vertical"
          className={!isMobile && pathname !== "/" ? "w-75" : "w-100"}
        >
          {children}
        </Stack>
      </Stack>
    </Stack>
  );
}
