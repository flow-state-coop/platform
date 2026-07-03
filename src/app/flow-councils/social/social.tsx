"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Toast from "react-bootstrap/Toast";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import AccountsEditor from "./components/AccountsEditor";
import ShareMessageEditor from "./components/ShareMessageEditor";
import ShareImageUploader from "./components/ShareImageUploader";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import {
  type RoundSocialConfig,
  type SocialAccount,
  DEFAULT_VOTE_MESSAGE,
  DEFAULT_DONATION_MESSAGE,
} from "@/app/flow-councils/lib/socialShare";

async function uploadShareImageToS3(
  file: Blob,
  fileName: string,
): Promise<string> {
  const presignRes = await fetch("/api/flow-council/images", {
    method: "POST",
    body: JSON.stringify({
      fileName,
      contentType: file.type,
      fileSize: file.size,
      kind: "share-image",
    }),
  });

  const { success, uploadUrl, publicUrl, error } = await presignRes.json();

  if (!success) {
    throw new Error(error || "Failed to get upload URL");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadRes.ok) {
    throw new Error("Failed to upload file");
  }

  return publicUrl;
}

type SocialProps = {
  chainId: number;
  councilId: string;
};

type MessageValidity = {
  xOver: boolean;
  farcasterOver: boolean;
};

export default function Social(props: SocialProps) {
  const { chainId, councilId } = props;

  const [social, setSocial] = useState<RoundSocialConfig>({
    accounts: [],
    voteMessage: DEFAULT_VOTE_MESSAGE,
    donationMessage: DEFAULT_DONATION_MESSAGE,
    shareImageUrl: "",
  });
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const [roundName, setRoundName] = useState("");
  const [roundExists, setRoundExists] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [voteValidity, setVoteValidity] = useState<MessageValidity>({
    xOver: false,
    farcasterOver: false,
  });
  const [donationValidity, setDonationValidity] = useState<MessageValidity>({
    xOver: false,
    farcasterOver: false,
  });

  const router = useRouter();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const roundLink = `https://flowstate.network/flow-councils/${chainId}/${councilId}`;
  const inputsDisabled = !session || session.address !== address || isSaving;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error ?? "Failed to fetch round");
        }

        if (data.round) {
          const details =
            typeof data.round.details === "string"
              ? JSON.parse(data.round.details)
              : data.round.details;
          const savedSocial = details?.social;

          setSocial({
            accounts: savedSocial?.accounts ?? [],
            voteMessage: savedSocial?.voteMessage?.trim()
              ? savedSocial.voteMessage
              : DEFAULT_VOTE_MESSAGE,
            donationMessage: savedSocial?.donationMessage?.trim()
              ? savedSocial.donationMessage
              : DEFAULT_DONATION_MESSAGE,
            shareImageUrl: savedSocial?.shareImageUrl ?? "",
          });
          setRoundName(details?.name ?? "");
          setRoundExists(true);
        }
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [chainId, councilId]);

  const handleAccountsChange = (accounts: SocialAccount[]) =>
    setSocial((prev) => ({ ...prev, accounts }));

  const handleAccountRename = (oldName: string, newName: string) => {
    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();

    if (
      !trimmedOldName ||
      !trimmedNewName ||
      trimmedOldName === trimmedNewName
    ) {
      return;
    }

    // If another account currently shares the old name, the tokens' ownership
    // is ambiguous; skip the rewrite rather than corrupt its mentions. The
    // same applies when the new name collides with another account's name,
    // since rewritten tokens would resolve to that account instead. The
    // renamed account still bears the old name in state here (onRename fires
    // before the accounts update), so any match on the new name is another
    // account.
    const accountsWithOldName = social.accounts.filter(
      (account) => account.name.trim() === trimmedOldName,
    );
    const accountsWithNewName = social.accounts.filter(
      (account) => account.name.trim() === trimmedNewName,
    );

    if (accountsWithOldName.length > 1 || accountsWithNewName.length > 0) {
      return;
    }

    const oldToken = `@[${trimmedOldName}]`;
    const newToken = `@[${trimmedNewName}]`;

    setSocial((prev) => ({
      ...prev,
      voteMessage: prev.voteMessage?.split(oldToken).join(newToken),
      donationMessage: prev.donationMessage?.split(oldToken).join(newToken),
    }));
  };

  const handleVoteMessageChange = (voteMessage: string) =>
    setSocial((prev) => ({ ...prev, voteMessage }));

  const handleDonationMessageChange = (donationMessage: string) =>
    setSocial((prev) => ({ ...prev, donationMessage }));

  const handleVoteValidityChange = useCallback(
    (validity: MessageValidity) =>
      setVoteValidity((prev) =>
        prev.xOver === validity.xOver &&
        prev.farcasterOver === validity.farcasterOver
          ? prev
          : validity,
      ),
    [],
  );

  const handleDonationValidityChange = useCallback(
    (validity: MessageValidity) =>
      setDonationValidity((prev) =>
        prev.xOver === validity.xOver &&
        prev.farcasterOver === validity.farcasterOver
          ? prev
          : validity,
      ),
    [],
  );

  const trimmedNames = social.accounts.map((account) =>
    account.name.trim().toLowerCase(),
  );
  const hasInvalidAccounts =
    trimmedNames.some((name) => !name) ||
    new Set(trimmedNames).size !== trimmedNames.length;

  const overLimitMessages = [
    voteValidity.xOver ? "Vote message is over the X limit" : null,
    voteValidity.farcasterOver
      ? "Vote message is over the Farcaster limit"
      : null,
    donationValidity.xOver ? "Donation message is over the X limit" : null,
    donationValidity.farcasterOver
      ? "Donation message is over the Farcaster limit"
      : null,
  ].filter((message): message is string => message !== null);

  const handleSave = async () => {
    if (!address || !session) {
      return;
    }

    try {
      setError("");
      setIsSaving(true);

      let shareImageUrl = social.shareImageUrl ?? "";

      if (shareImageBlob) {
        shareImageUrl = await uploadShareImageToS3(
          shareImageBlob,
          `share-image.${shareImageBlob.type.split("/")[1]}`,
        );

        // Commit the uploaded URL before the PATCH so a failed save retries
        // with it instead of uploading a new orphan.
        setSocial((prev) => ({ ...prev, shareImageUrl }));
        setShareImageBlob(null);
      }

      const res = await fetch("/api/flow-council/rounds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          flowCouncilAddress: councilId,
          social: { ...social, shareImageUrl },
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setIsSaving(false);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={`justify-content-center align-items-center ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
        >
          <Spinner />
        </Stack>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={`justify-content-center align-items-center ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
        >
          <Alert
            variant="danger"
            className="w-100 p-4 fw-semi-bold text-danger"
          >
            Failed to load the round. Please try again later.
          </Alert>
        </Stack>
      </>
    );
  }

  if (!roundExists) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={`justify-content-center align-items-center ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
        >
          <span className="fs-4 fw-bold text-center">
            Please create your round in the{" "}
            <Link
              href={`/flow-councils/round-metadata/${chainId}/${councilId}`}
            >
              Metadata
            </Link>{" "}
            tab first.
          </span>
        </Stack>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-5 fw-semi-bold">
            Social
          </Card.Header>
          <Card.Body className="p-0 mt-2">
            <AccountsEditor
              accounts={social.accounts}
              disabled={inputsDisabled}
              onChange={handleAccountsChange}
              onRename={handleAccountRename}
            />
            <ShareMessageEditor
              title="Vote Message"
              variant="vote"
              template={social.voteMessage ?? ""}
              accounts={social.accounts}
              roundName={roundName}
              roundLink={roundLink}
              disabled={inputsDisabled}
              onChange={handleVoteMessageChange}
              onValidityChange={handleVoteValidityChange}
            />
            <ShareMessageEditor
              title="Donation Message"
              variant="donation"
              template={social.donationMessage ?? ""}
              accounts={social.accounts}
              roundName={roundName}
              roundLink={roundLink}
              disabled={inputsDisabled}
              onChange={handleDonationMessageChange}
              onValidityChange={handleDonationValidityChange}
            />
            <ShareImageUploader
              shareImageUrl={social.shareImageUrl ?? ""}
              shareImageBlob={shareImageBlob}
              disabled={inputsDisabled}
              onSelectBlob={(blob) => {
                setShareImageBlob(blob);
                setSocial((prev) => ({ ...prev, shareImageUrl: "" }));
              }}
              onRemove={() => {
                setShareImageBlob(null);
                setSocial((prev) => ({ ...prev, shareImageUrl: "" }));
              }}
            />
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          {(hasInvalidAccounts || overLimitMessages.length > 0) && (
            <Stack direction="vertical" gap={1}>
              {hasInvalidAccounts && (
                <span className="text-danger small">
                  Each account needs a unique, non-empty name.
                </span>
              )}
              {overLimitMessages.map((message) => (
                <span key={message} className="text-danger small">
                  {message}
                </span>
              ))}
            </Stack>
          )}
          {!session || session.address !== address ? (
            <Button
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
              onClick={() => {
                if (!address && openConnectModal) {
                  openConnectModal();
                } else if (connectedChain?.id !== chainId) {
                  switchChain({ chainId });
                } else {
                  handleSignIn();
                }
              }}
            >
              {!address
                ? "Connect Wallet"
                : connectedChain?.id !== chainId
                  ? "Switch Network"
                  : "Sign In With Ethereum"}
            </Button>
          ) : (
            <Button
              disabled={
                isSaving || hasInvalidAccounts || overLimitMessages.length > 0
              }
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
              onClick={handleSave}
            >
              {isSaving ? <Spinner size="sm" /> : "Save"}
            </Button>
          )}
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() =>
              router.push(`/flow-councils/${chainId}/${councilId}`)
            }
          >
            Next
          </Button>
          <Toast
            show={success}
            delay={4000}
            autohide={true}
            onClose={() => setSuccess(false)}
            className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
          >
            Saved successfully!
          </Toast>
          {error && (
            <Alert
              variant="danger"
              className="w-100 p-4 fw-semi-bold text-danger"
            >
              {error}
            </Alert>
          )}
        </Stack>
      </Stack>
    </>
  );
}
