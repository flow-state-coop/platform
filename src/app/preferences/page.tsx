import { Suspense } from "react";
import type { Metadata } from "next";
import PreferencesPage from "./PreferencesPage";

// The HMAC token rides in `?token=` and stays valid until `email_version`
// bumps. `no-referrer` stops it leaking via the `Referer` header on any
// future outbound link added to this page.
export const metadata: Metadata = { referrer: "no-referrer" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PreferencesPage />
    </Suspense>
  );
}
