"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Toast from "react-bootstrap/Toast";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Sidebar from "../components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";

async function uploadToS3(file: Blob, fileName: string): Promise<string> {
  const presignRes = await fetch("/api/flow-council/images", {
    method: "POST",
    body: JSON.stringify({
      fileName,
      contentType: file.type,
      fileSize: file.size,
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

type RoundMetadataProps = {
  chainId: number;
  councilId?: string;
  csrfToken: string;
};

type RoundDetails = {
  name: string;
  description: string;
  logoUrl: string;
};

export default function RoundMetadata(props: RoundMetadataProps) {
  const { chainId, councilId, csrfToken } = props;

  const [roundDetails, setRoundDetails] = useState<RoundDetails>({
    name: "",
    description: "",
    logoUrl: "",
  });
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [logoError, setLogoError] = useState("");
  const [roundExists, setRoundExists] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    (async () => {
      if (!councilId) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();

        if (data.success && data.round) {
          const details =
            typeof data.round.details === "string"
              ? JSON.parse(data.round.details)
              : data.round.details;

          setRoundDetails({
            name: details?.name ?? "",
            description: details?.description ?? "",
            logoUrl: details?.logoUrl ?? "",
          });
          setRoundExists(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [chainId, councilId]);

  const handleFileUpload = () => {
    if (!fileInputRef.current?.files) {
      return;
    }

    const file = fileInputRef.current.files[0];

    if (file.size > 1000000) {
      setLogoError("Size too large (max 1MB)");
    } else {
      setLogoBlob(file);
      setLogoError("");
      setRoundDetails({ ...roundDetails, logoUrl: "" });
    }
  };

  const handleSave = async () => {
    if (!address || !councilId || !session) {
      return;
    }

    try {
      setError("");
      setIsSaving(true);

      let logoUrl = roundDetails.logoUrl;

      if (logoBlob) {
        logoUrl = await uploadToS3(
          logoBlob,
          `round-logo.${logoBlob.type.split("/")[1]}`,
        );
      }

      const endpoint = roundExists
        ? "/api/flow-council/rounds"
        : "/api/flow-council/launch";
      const method = roundExists ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          flowCouncilAddress: councilId,
          name: roundDetails.name,
          description: roundDetails.description,
          logoUrl,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setRoundDetails({ ...roundDetails, logoUrl });
      setLogoBlob(null);
      setRoundExists(true);
      setIsSaving(false);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  };

  if (!councilId) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={`justify-content-center align-items-center ${!isMobile ? "w-75 px-5" : "w-100 px-4"}`}
        >
          <span className="fs-4 fw-bold">
            Please launch a Flow Council first.
          </span>
        </Stack>
      </>
    );
  }

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

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0 fs-5 fw-semi-bold">
            Round Metadata
          </Card.Header>
          <Card.Body className="p-0 mt-2">
            <Form.Control
              type="text"
              placeholder="Name"
              value={roundDetails.name}
              className="border-0 py-4 bg-white fs-lg fw-semi-bold"
              style={{
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setRoundDetails({ ...roundDetails, name: e.target.value })
              }
            />
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Description (Supports Markdown)"
              value={roundDetails.description}
              className="border-0 py-4 bg-white mt-3 fs-lg fw-semi-bold"
              style={{
                resize: "none",
                paddingTop: 12,
                paddingBottom: 12,
              }}
              onChange={(e) =>
                setRoundDetails({
                  ...roundDetails,
                  description: e.target.value,
                })
              }
            />
            <Form.Group className="d-flex flex-column mt-3">
              <Form.Label className="fs-lg fw-semi-bold">
                Round Logo (1:1 Aspect Ratio, Max 1MB)
              </Form.Label>
              <Form.Control
                type="file"
                hidden
                accept=".png,.jpeg,.jpg"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <Stack
                direction="horizontal"
                gap={4}
                className="align-items-center"
              >
                <Button
                  className="bg-white border-0"
                  style={{
                    width: 200,
                    height: 100,
                    border: "1px dashed #adb5bd",
                    color: "#adb5bd",
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Stack direction="vertical" className="align-items-center">
                    <Image src="/upload.svg" alt="upload" width={28} />
                    <span className="small">Upload PNG or JPEG</span>
                  </Stack>
                </Button>
                {logoError ? (
                  <Card.Text className="m-0 text-danger">{logoError}</Card.Text>
                ) : (
                  (logoBlob || roundDetails.logoUrl) && (
                    <>
                      <Image
                        src={
                          logoBlob
                            ? URL.createObjectURL(logoBlob)
                            : roundDetails.logoUrl
                        }
                        alt="logo"
                        width={80}
                        height={80}
                        className="rounded-4"
                      />
                      <Button
                        variant="transparent"
                        className="p-0"
                        onClick={() => {
                          setLogoBlob(null);
                          setRoundDetails({ ...roundDetails, logoUrl: "" });
                        }}
                      >
                        <Image
                          src="/close.svg"
                          alt="Remove"
                          width={28}
                          height={28}
                        />
                      </Button>
                    </>
                  )
                )}
              </Stack>
            </Form.Group>
          </Card.Body>
        </Card>
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          {!session || session.address !== address ? (
            <Button
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : handleSignIn(csrfToken);
              }}
            >
              Sign In With Ethereum
            </Button>
          ) : (
            <Button
              disabled={
                !roundDetails.name || !roundDetails.description || isSaving
              }
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
              onClick={handleSave}
            >
              {isSaving ? (
                <Spinner size="sm" />
              ) : roundExists ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            onClick={() =>
              router.push(
                `/flow-councils/permissions/?chainId=${chainId}&councilId=${councilId}`,
              )
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
