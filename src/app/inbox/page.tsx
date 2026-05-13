import { Suspense } from "react";
import InboxPage from "./InboxPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InboxPage />
    </Suspense>
  );
}
