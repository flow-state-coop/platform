import dynamic from "next/dynamic";
import Stack from "react-bootstrap/Stack";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Providers from "./providers";
import { OG_DEFAULT_IMAGE_URL } from "@/lib/constants";

const PostHog = dynamic(() => import("./posthog"), {
  ssr: false,
});

export const metadata = {
  metadataBase:
    process.env.NODE_ENV === "development"
      ? new URL(`http://localhost:${process.env.PORT || 3000}`)
      : void 0,
  title: "Flow State",
  openGraph: {
    title: "Flow State - Making Impact Common",
    description:
      "A streaming funding platform & digital cooperative for funding, sustaining, & rewarding impact work. Streaming quadratic funding, streaming quadratic voting, council voting, & more.",
    url: "https://flowstate.network",
    siteName: "Flow State",
    images: [
      {
        url: OG_DEFAULT_IMAGE_URL,
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flow State - Making Impact Common",
    description:
      "A streaming funding platform & digital cooperative for funding, sustaining, & rewarding impact work. Streaming quadratic funding, streaming quadratic voting, council voting, & more.",
    images: [
      {
        url: OG_DEFAULT_IMAGE_URL,
        width: 1200,
        height: 630,
      },
    ],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <Stack
            direction="horizontal"
            className="flex-grow-1 align-items-start"
            style={{ minHeight: "100svh" }}
          >
            {children}
          </Stack>
          <Footer />
          <PostHog />
        </Providers>
      </body>
    </html>
  );
}
