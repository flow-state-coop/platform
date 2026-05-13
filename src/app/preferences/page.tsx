import { Suspense } from "react";
import PreferencesPage from "./PreferencesPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PreferencesPage />
    </Suspense>
  );
}
