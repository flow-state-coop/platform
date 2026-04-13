"use client";

import { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Link from "next/link";

type PublicProfileData = {
  address: string;
  displayName: string | null;
  bio: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  farcaster: string | null;
};

const SOCIAL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  github: "GitHub",
  linkedin: "LinkedIn",
  farcaster: "Farcaster",
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isSafeHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export default function PublicProfile({ address }: { address: string }) {
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/profile?address=${encodeURIComponent(address)}`,
        );
        const data = await res.json();
        if (data.success) {
          setProfile(data.profile);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [address]);

  if (isLoading) {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ maxWidth: 600 }}>
      <h2 className="mb-4">
        {profile?.displayName || truncateAddress(address)}
      </h2>

      <div className="mb-4">
        <p className="text-muted small mb-1">Wallet Address</p>
        <p className="font-monospace mb-1">{address}</p>
        <Link
          href={`/projects?owner=${address}`}
          className="text-primary small"
        >
          View projects
        </Link>
      </div>

      {profile?.bio && (
        <div className="mb-4">
          <p className="text-muted small mb-1">Bio</p>
          <p>{profile.bio}</p>
        </div>
      )}

      {profile && (
        <Stack gap={2}>
          {(["twitter", "github", "linkedin", "farcaster"] as const).map(
            (field) => {
              const value = profile[field];
              if (!value || !isSafeHttpsUrl(value)) return null;
              return (
                <div key={field}>
                  <span className="text-muted small">
                    {SOCIAL_LABELS[field]}:{" "}
                  </span>
                  <a href={value} target="_blank" rel="noopener noreferrer">
                    {value}
                  </a>
                </div>
              );
            },
          )}
        </Stack>
      )}

      {!profile && (
        <p className="text-muted">This address has not set up a profile yet.</p>
      )}
    </Container>
  );
}
