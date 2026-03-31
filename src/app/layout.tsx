import { Archivo } from "next/font/google";
import Stack from "react-bootstrap/Stack";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Providers from "./providers";
import { OG_DEFAULT_IMAGE_URL } from "@/lib/constants";
import PostHog from "./posthog";

export const metadata = {
  metadataBase:
    process.env.NODE_ENV === "development"
      ? new URL(`http://localhost:${process.env.PORT || 3000}`)
      : void 0,
  title:
    "Flow State - Streaming funding solutions where capital flows to impact",
  openGraph: {
    title:
      "Flow State - Streaming funding solutions where capital flows to impact",
    description:
      "We build continuous funding apps, payment tools, & incentive systems with Superfluid's programmable money streams: Flow Councils, Flow Splitters, Flow QF, & more.",
    url: "https://flowstate.network/",
    siteName: "Flow State",
    type: "website",
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
    title:
      "Flow State - Streaming funding solutions where capital flows to impact",
    description:
      "We build continuous funding apps, payment tools, & incentive systems with Superfluid's programmable money streams: Flow Councils, Flow Splitters, Flow QF, & more.",
    images: [
      {
        url: OG_DEFAULT_IMAGE_URL,
        width: 1200,
        height: 630,
      },
    ],
  },
};

const archivo = Archivo({
  subsets: ["latin"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html className={archivo.className}>
      <body>
        <Providers>
          <Header />
          <main>
            <Stack
              direction="horizontal"
              className="flex-grow-1 align-items-start"
              style={{ minHeight: "100svh" }}
            >
              {children}
            </Stack>
          </main>
          <Footer />
          <PostHog />
        </Providers>
      </body>
    </html>
  );
}
