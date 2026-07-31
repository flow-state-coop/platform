"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Alert from "react-bootstrap/Alert";

type ShowSignInError = (message: string) => void;

/**
 * Where a failed sign-in gets to say so.
 *
 * Sign-in is driven from hooks, not from components: the automatic prompt in
 * `Providers` and `useRequireAuth` both call it and render nothing, so a failure
 * has no markup of its own to appear in. Every page owning its own error state
 * would not reach those two paths, which are the ones most sign-ins take. One
 * surface mounted above them all does, and it is what replaces the blocking
 * `window.alert` this used to be: a modal dialog stops the page, and some mobile
 * wallet browsers suppress it outright, so the failure that most needed saying
 * was the one least likely to be seen.
 */
const SignInErrorContext = createContext<ShowSignInError>(() => {});

export function useSignInError(): ShowSignInError {
  return useContext(SignInErrorContext);
}

export default function SignInErrorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState("");

  const showSignInError = useCallback((next: string) => setMessage(next), []);

  return (
    <SignInErrorContext.Provider value={showSignInError}>
      {children}
      {message ? (
        // Positioned like the wallet-switch notice in `Providers`, which is the
        // one other thing here that has to speak from outside the page.
        <Alert
          variant="danger"
          dismissible
          onClose={() => setMessage("")}
          className="position-fixed top-0 start-50 translate-middle-x mt-3 shadow"
          style={{ zIndex: 2000, maxWidth: "90vw" }}
        >
          {message}
        </Alert>
      ) : null}
    </SignInErrorContext.Provider>
  );
}
