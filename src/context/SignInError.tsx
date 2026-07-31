"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";

type SignInErrorContextValue = {
  showSignInError: (message: string) => void;
  clearSignInError: () => void;
};

const SignInErrorContext = createContext<SignInErrorContextValue | null>(null);

export function useSignInError(): SignInErrorContextValue {
  const context = useContext(SignInErrorContext);

  if (!context) {
    throw new Error("useSignInError requires SignInErrorProvider");
  }

  return context;
}

// Sign-in is driven from hooks that render nothing of their own (AutoSiwe in
// `Providers`, `useRequireAuth`), so failures surface on this one notice
// mounted above them all.
export function SignInErrorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notice, setNotice] = useState<{
    message: string;
    attempt: number;
  } | null>(null);

  const value = useMemo(
    () => ({
      showSignInError: (message: string) =>
        setNotice((prev) => ({ message, attempt: (prev?.attempt ?? 0) + 1 })),
      clearSignInError: () => setNotice(null),
    }),
    [],
  );

  return (
    <SignInErrorContext.Provider value={value}>
      {children}
      {notice ? (
        // Keyed per attempt so a repeated failure remounts the alert and
        // screen readers re-announce it. Bottom-center stays clear of the
        // wallet-switch warning pinned top-center in `Providers`; the z-index
        // is one above RainbowKit's overlay so a failure surfaced while the
        // wallet modal is still up remains visible.
        <Alert
          key={notice.attempt}
          variant="danger"
          dismissible
          onClose={() => setNotice(null)}
          className="position-fixed bottom-0 start-50 translate-middle-x mb-3 shadow"
          style={{ zIndex: 2147483647, maxWidth: "90vw" }}
        >
          {notice.message}
        </Alert>
      ) : null}
    </SignInErrorContext.Provider>
  );
}
