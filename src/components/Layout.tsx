import Head from "next/head";
import Stack from "react-bootstrap/Stack";
import Header from "./Header";
import Footer from "./Footer";

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Head>
        <title>Flow State - Making Impact Common</title>
      </Head>
      <Stack direction="vertical">
        <Header />
        <Stack
          direction="horizontal"
          className="flex-grow-1"
          style={{ minHeight: "100svh" }}
        >
          <Stack direction="vertical">{children}</Stack>
        </Stack>
        <Footer />
      </Stack>
    </>
  );
}
