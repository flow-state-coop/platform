"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

export default function GithubAuth() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (!session && status !== "loading") {
      signIn("github");
    }

    if (session) {
      window.close();
    }
  }, [session, status]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        left: 0,
        top: 0,
        background: "white",
      }}
    ></div>
  );
}
