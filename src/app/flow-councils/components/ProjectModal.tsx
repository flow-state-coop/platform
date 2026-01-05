"use client";

import { useState, useRef } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import InputGroup from "react-bootstrap/InputGroup";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
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

type ProjectModalProps = {
  show: boolean;
  chainId: number;
  csrfToken: string;
  handleClose: () => void;
  onProjectCreated: () => void;
  mode: "create" | "edit";
  project?: {
    id: number;
    details: {
      name: string;
      description: string;
      logoUrl?: string;
      bannerUrl?: string;
      website?: string;
      twitter?: string;
      github?: string;
    } | null;
  };
};

type ProjectForm = {
  name: string;
  description: string;
  website: string;
  twitter: string;
  github: string;
};

export default function ProjectModal(props: ProjectModalProps) {
  const {
    show,
    chainId,
    csrfToken,
    handleClose,
    onProjectCreated,
    mode,
    project,
  } = props;

  const [form, setForm] = useState<ProjectForm>({
    name: project?.details?.name ?? "",
    description: project?.details?.description ?? "",
    website: project?.details?.website ?? "",
    twitter: project?.details?.twitter ?? "",
    github: project?.details?.github ?? "",
  });
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState(
    project?.details?.logoUrl ?? "",
  );
  const [existingBannerUrl, setExistingBannerUrl] = useState(
    project?.details?.bannerUrl ?? "",
  );
  const [validated, setValidated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const [error, setError] = useState("");

  const fileInputRefLogo = useRef<HTMLInputElement>(null);
  const fileInputRefBanner = useRef<HTMLInputElement>(null);

  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();

  const hasLogo = !!logoBlob || !!existingLogoUrl;
  const hasBanner = !!bannerBlob || !!existingBannerUrl;
  const isValid = !!form.name && !!form.description && hasLogo && hasBanner;

  const handleFileUploadLogo = () => {
    if (!fileInputRefLogo.current?.files) {
      return;
    }

    const file = fileInputRefLogo.current.files[0];

    if (file.size > 256000) {
      setLogoError("Size too large (max 256KB)");
    } else {
      setLogoBlob(file);
      setLogoError("");
      setExistingLogoUrl("");
    }
  };

  const handleFileUploadBanner = () => {
    if (!fileInputRefBanner.current?.files) {
      return;
    }

    const file = fileInputRefBanner.current.files[0];

    if (file.size > 1000000) {
      setBannerError("Size too large (max 1MB)");
    } else {
      setBannerBlob(file);
      setBannerError("");
      setExistingBannerUrl("");
    }
  };

  const handleSaveProject = async () => {
    if (!session?.address) {
      throw Error("Account is not signed in");
    }

    try {
      setIsSubmitting(true);
      setError("");

      let logoUrl = existingLogoUrl;
      let bannerUrl = existingBannerUrl;

      if (logoBlob) {
        logoUrl = await uploadToS3(
          logoBlob,
          `logo.${logoBlob.type.split("/")[1]}`,
        );
      }

      if (bannerBlob) {
        bannerUrl = await uploadToS3(
          bannerBlob,
          `banner.${bannerBlob.type.split("/")[1]}`,
        );
      }

      const endpoint = "/api/flow-council/projects";
      const method = mode === "create" ? "POST" : "PATCH";
      const body = {
        ...(mode === "edit" && { projectId: project?.id }),
        name: form.name,
        description: form.description,
        logoUrl,
        bannerUrl,
        website: form.website,
        twitter: form.twitter,
        github: form.github,
      };

      const res = await fetch(endpoint, {
        method,
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        console.error(json.error);
        setError(json.error || "Failed to save project");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onProjectCreated();
      handleClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save project");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    setValidated(true);

    if (!address && openConnectModal) {
      openConnectModal();
    } else if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    } else if (!session || session.address !== address) {
      handleSignIn(csrfToken);
    } else if (isValid) {
      handleSaveProject();
    }
  };

  return (
    <Modal
      show={show}
      size="lg"
      centered
      scrollable
      contentClassName="bg-lace-100"
      onHide={handleClose}
    >
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">
          {mode === "create" ? "Create Project" : "Edit Project"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <Form>
          <Form.Group className="mb-4">
            <Form.Label>Project Name*</Form.Label>
            <Form.Control
              type="text"
              value={form.name}
              placeholder="Your project name"
              className="border-0 bg-white py-3"
              isInvalid={validated && !form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Description*</Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              value={form.description}
              placeholder="Your project description"
              className="border-0 bg-white py-3"
              isInvalid={validated && !form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>Project Logo* (1:1 Aspect Ratio, Max 256KB)</Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefLogo}
              onChange={handleFileUploadLogo}
            />
            <Stack
              direction="horizontal"
              gap={4}
              className="align-items-center"
            >
              <Button
                className="bg-transparent"
                style={{
                  width: 256,
                  height: 128,
                  border: `1px dashed ${validated && !hasLogo ? "#dc3545" : "#adb5bd"}`,
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefLogo.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {logoError ? (
                <Card.Text className="m-0 text-danger">{logoError}</Card.Text>
              ) : (
                (logoBlob || existingLogoUrl) && (
                  <>
                    <Image
                      src={
                        logoBlob
                          ? URL.createObjectURL(logoBlob)
                          : existingLogoUrl
                      }
                      alt="logo"
                      width={96}
                      height={96}
                      className="rounded-4"
                    />
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => {
                        setLogoBlob(null);
                        setExistingLogoUrl("");
                      }}
                    >
                      <Image
                        src="/close.svg"
                        alt="Cancel"
                        width={32}
                        height={32}
                      />
                    </Button>
                  </>
                )
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>Project Banner* (3:1 Aspect Ratio, Max 1MB)</Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefBanner}
              onChange={handleFileUploadBanner}
            />
            <Stack
              direction="horizontal"
              gap={4}
              className="align-items-center"
            >
              <Button
                className="bg-transparent"
                style={{
                  width: 256,
                  height: 128,
                  border: `1px dashed ${validated && !hasBanner ? "#dc3545" : "#adb5bd"}`,
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefBanner.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {bannerError ? (
                <Card.Text className="m-0 text-danger">{bannerError}</Card.Text>
              ) : (
                (bannerBlob || existingBannerUrl) && (
                  <>
                    <Image
                      src={
                        bannerBlob
                          ? URL.createObjectURL(bannerBlob)
                          : existingBannerUrl
                      }
                      alt="banner"
                      width={150}
                      height={50}
                    />
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => {
                        setBannerBlob(null);
                        setExistingBannerUrl("");
                      }}
                    >
                      <Image
                        src="/close.svg"
                        alt="Cancel"
                        width={32}
                        height={32}
                      />
                    </Button>
                  </>
                )
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Website</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://</InputGroup.Text>
              <Form.Control
                type="text"
                value={form.website}
                placeholder="example.com"
                className="border-0 bg-white py-3"
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Twitter</Form.Label>
            <InputGroup>
              <InputGroup.Text>@</InputGroup.Text>
              <Form.Control
                type="text"
                value={form.twitter}
                placeholder="yourproject"
                className="border-0 bg-white py-3"
                onChange={(e) => setForm({ ...form, twitter: e.target.value })}
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Github</Form.Label>
            <InputGroup>
              <InputGroup.Text>github.com/</InputGroup.Text>
              <Form.Control
                type="text"
                value={form.github}
                placeholder="your-org"
                className="border-0 bg-white py-3"
                onChange={(e) => setForm({ ...form, github: e.target.value })}
              />
            </InputGroup>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer className="border-0 p-4">
        <Stack direction="vertical" gap={2} className="align-items-end">
          {error && (
            <Card.Text className="text-danger fw-semi-bold">{error}</Card.Text>
          )}
          {!session || session.address !== address ? (
            <Button
              className="w-25 py-4 text-light rounded-4 fw-semi-bold"
              onClick={handleSubmit}
            >
              Sign In
            </Button>
          ) : (
            <Button
              disabled={validated && !isValid}
              className="w-25 py-4 text-light rounded-4 fw-semi-bold"
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Spinner size="sm" />
              ) : mode === "create" ? (
                "Create"
              ) : (
                "Save"
              )}
            </Button>
          )}
          {validated && !isValid && (
            <Card.Text className="text-danger fw-semi-bold">
              *Please complete the required fields.
            </Card.Text>
          )}
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
