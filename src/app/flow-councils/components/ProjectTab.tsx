"use client";

import { useState, useRef, useEffect } from "react";
import { isAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import MultiInput from "./MultiInput";
import SmartContractRow, { type SmartContract } from "./SmartContractRow";
import OtherLinkRow, { type OtherLink } from "./OtherLinkRow";
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

type ProjectDetails = {
  name: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
  defaultFundingAddress?: string;
  demoUrl?: string;
  farcaster?: string;
  telegram?: string;
  discord?: string;
  karmaProfile?: string;
  githubRepos?: string[];
  smartContracts?: SmartContract[];
  otherLinks?: OtherLink[];
};

type Project = {
  id: number;
  details: ProjectDetails | null;
  managerAddresses: string[];
  managerEmails: string[];
};

type ProjectTabProps = {
  chainId: number;
  csrfToken: string;
  project: Project | null;
  isLoading: boolean;
  onSave: (projectId: number) => void;
  onCancel: () => void;
};

type ProjectForm = {
  name: string;
  managerAddresses: string[];
  managerEmails: string[];
  defaultFundingAddress: string;
  description: string;
  website: string;
  demoUrl: string;
  twitter: string;
  farcaster: string;
  telegram: string;
  discord: string;
  karmaProfile: string;
  githubRepos: string[];
  smartContracts: SmartContract[];
  otherLinks: OtherLink[];
};

const isValidEmail = (email: string): boolean => {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidUrl = (url: string): boolean => {
  if (!url) return true;
  return url.startsWith("https://");
};

export default function ProjectTab(props: ProjectTabProps) {
  const { chainId, csrfToken, project, isLoading, onSave, onCancel } = props;

  const [form, setForm] = useState<ProjectForm>({
    name: "",
    managerAddresses: [""],
    managerEmails: [""],
    defaultFundingAddress: "",
    description: "",
    website: "",
    demoUrl: "",
    twitter: "",
    farcaster: "",
    telegram: "",
    discord: "",
    karmaProfile: "",
    githubRepos: [""],
    smartContracts: [
      { type: "projectAddress", network: "Arbitrum One", address: "" },
    ],
    otherLinks: [{ description: "", url: "" }],
  });

  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState("");
  const [existingBannerUrl, setExistingBannerUrl] = useState("");
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

  useEffect(() => {
    if (project && project.details) {
      setForm({
        name: project.details.name ?? "",
        managerAddresses:
          project.managerAddresses.length > 0 ? project.managerAddresses : [""],
        managerEmails:
          project.managerEmails.length > 0 ? project.managerEmails : [""],
        defaultFundingAddress: project.details.defaultFundingAddress ?? "",
        description: project.details.description ?? "",
        website: project.details.website ?? "",
        demoUrl: project.details.demoUrl ?? "",
        twitter: project.details.twitter ?? "",
        farcaster: project.details.farcaster ?? "",
        telegram: project.details.telegram ?? "",
        discord: project.details.discord ?? "",
        karmaProfile: project.details.karmaProfile ?? "",
        githubRepos:
          project.details.githubRepos && project.details.githubRepos.length > 0
            ? project.details.githubRepos
            : [""],
        smartContracts:
          project.details.smartContracts &&
          project.details.smartContracts.length > 0
            ? project.details.smartContracts
            : [
                {
                  type: "projectAddress",
                  network: "Arbitrum One",
                  address: "",
                },
              ],
        otherLinks:
          project.details.otherLinks && project.details.otherLinks.length > 0
            ? project.details.otherLinks
            : [{ description: "", url: "" }],
      });
      setExistingLogoUrl(project.details.logoUrl ?? "");
      setExistingBannerUrl(project.details.bannerUrl ?? "");
    }
  }, [project]);

  useEffect(() => {
    if (session?.address) {
      const sessionAddr = session.address.toLowerCase();
      setForm((prev) => {
        // Filter out any existing instance of session address (case-insensitive)
        const otherAddresses = prev.managerAddresses.filter(
          (a) => a && a.toLowerCase() !== sessionAddr,
        );
        // Always put session address first
        const newAddresses = [
          session.address,
          ...otherAddresses.filter((a) => a), // remove empty strings
        ];
        // Ensure at least one slot for additional addresses if only session address exists
        if (newAddresses.length === 1) {
          newAddresses.push("");
        }
        return {
          ...prev,
          managerAddresses: newAddresses,
          defaultFundingAddress: prev.defaultFundingAddress || session.address,
        };
      });
    }
  }, [session?.address]);

  const hasLogo = !!logoBlob || !!existingLogoUrl;
  const hasBanner = !!bannerBlob || !!existingBannerUrl;
  const hasValidManagerAddress =
    form.managerAddresses.filter((a) => a && isAddress(a)).length > 0;
  const hasValidManagerEmail =
    form.managerEmails.filter((e) => e && isValidEmail(e)).length > 0;
  const hasValidGithubRepo =
    form.githubRepos.filter((r) => r && isValidUrl(r)).length > 0;

  const isValid =
    !!form.name &&
    hasValidManagerAddress &&
    hasValidManagerEmail &&
    isAddress(form.defaultFundingAddress) &&
    !!form.description &&
    hasLogo &&
    hasBanner &&
    !!form.website &&
    hasValidGithubRepo;

  const handleFileUploadLogo = () => {
    if (!fileInputRefLogo.current?.files) return;
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
    if (!fileInputRefBanner.current?.files) return;
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
    if (!session?.address) throw Error("Account is not signed in");

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
      const method = project ? "PATCH" : "POST";
      const body = {
        ...(project && { projectId: project.id }),
        name: form.name,
        description: form.description,
        logoUrl,
        bannerUrl,
        website: form.website,
        twitter: form.twitter,
        managerAddresses: form.managerAddresses.filter(
          (a) => a && isAddress(a),
        ),
        managerEmails: form.managerEmails.filter((e) => e && isValidEmail(e)),
        defaultFundingAddress: form.defaultFundingAddress,
        demoUrl: form.demoUrl,
        farcaster: form.farcaster,
        telegram: form.telegram,
        discord: form.discord,
        karmaProfile: form.karmaProfile,
        githubRepos: form.githubRepos.filter((r) => r && isValidUrl(r)),
        smartContracts: form.smartContracts.filter((c) => c.address),
        otherLinks: form.otherLinks.filter((l) => l.url && l.description),
      };

      const res = await fetch(endpoint, { method, body: JSON.stringify(body) });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Failed to save project");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSave(json.project.id);
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

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  return (
    <Form>
      {/* Section 1: Admin */}
      <h4 className="fw-bold mb-4">1. Admin</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Name*</Form.Label>
        <Form.Control
          type="text"
          value={form.name}
          placeholder=""
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !form.name ? "border-danger" : "border-dark"}`}
          isInvalid={validated && !form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Form.Group>

      <MultiInput
        label="Manager Addresses"
        subtitle="All managers can make changes to the project including changing the funding address. Your signed-in address is locked as the primary manager."
        values={form.managerAddresses}
        onChange={(values) => setForm({ ...form, managerAddresses: values })}
        placeholder=""
        addLabel="Add Another"
        validate={(v) => isAddress(v)}
        required
        validated={validated}
        lockedIndices={[0]}
        invalidFeedback="Please enter a valid ETH address"
      />

      <MultiInput
        label="Manager Emails"
        subtitle="Provide one or more email to receive project & funding round communications."
        values={form.managerEmails}
        onChange={(values) => setForm({ ...form, managerEmails: values })}
        placeholder=""
        addLabel="Add Another"
        validate={isValidEmail}
        required
        validated={validated}
      />

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold mb-1">
          Default Funding Address*
        </Form.Label>
        <p className="text-muted small mb-2">
          Set an EOA or Safe address for ongoing funding opportunities outside
          of sponsored rounds.
        </p>
        <Form.Control
          type="text"
          value={form.defaultFundingAddress}
          placeholder=""
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !isAddress(form.defaultFundingAddress) ? "border-danger" : "border-dark"}`}
          isInvalid={validated && !isAddress(form.defaultFundingAddress)}
          onChange={(e) =>
            setForm({ ...form, defaultFundingAddress: e.target.value })
          }
        />
        <Form.Control.Feedback type="invalid">
          Please enter a valid ETH address
        </Form.Control.Feedback>
      </Form.Group>

      {/* Section 2: Basics */}
      <h4 className="fw-bold mb-4 mt-8">2. Basics</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Description* (Markdown supported)
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={6}
          value={form.description}
          placeholder=""
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !form.description ? "border-danger" : "border-dark"}`}
          style={{ resize: "none" }}
          isInvalid={validated && !form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="d-flex flex-column mb-4">
        <Form.Label className="fs-lg fw-bold">
          Logo* (1:1 Aspect Ratio, Max 256KB)
        </Form.Label>
        <Form.Control
          type="file"
          hidden
          accept=".png,.jpeg,.jpg"
          ref={fileInputRefLogo}
          onChange={handleFileUploadLogo}
        />
        <Stack direction="horizontal" gap={4} className="align-items-center">
          <Button
            className="bg-transparent"
            style={{
              width: 256,
              height: 128,
              border: `2px dashed ${validated && !hasLogo ? "#dc3545" : "#212529"}`,
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
            <p className="m-0 text-danger">{logoError}</p>
          ) : (
            (logoBlob || existingLogoUrl) && (
              <>
                <Image
                  src={
                    logoBlob ? URL.createObjectURL(logoBlob) : existingLogoUrl
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
                    setExistingLogoUrl("");
                  }}
                >
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
                </Button>
              </>
            )
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="d-flex flex-column mb-4">
        <Form.Label className="fs-lg fw-bold">
          Banner* (3:1 Aspect Ratio, Max 1MB)
        </Form.Label>
        <Form.Control
          type="file"
          hidden
          accept=".png,.jpeg,.jpg"
          ref={fileInputRefBanner}
          onChange={handleFileUploadBanner}
        />
        <Stack direction="horizontal" gap={4} className="align-items-center">
          <Button
            className="bg-transparent"
            style={{
              width: 256,
              height: 128,
              border: `2px dashed ${validated && !hasBanner ? "#dc3545" : "#212529"}`,
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
            <p className="m-0 text-danger">{bannerError}</p>
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
                  <Image src="/close.svg" alt="Remove" width={28} height={28} />
                </Button>
              </>
            )
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Website*</Form.Label>
        <Form.Control
          type="text"
          value={form.website}
          placeholder=""
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !form.website ? "border-danger" : "border-dark"}`}
          isInvalid={validated && !form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Demo/Application Link</Form.Label>
        <Form.Control
          type="text"
          value={form.demoUrl}
          placeholder=""
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          onChange={(e) => setForm({ ...form, demoUrl: e.target.value })}
        />
      </Form.Group>

      {/* Section 3: Social */}
      <h4 className="fw-bold mb-4 mt-8">3. Social</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">X/Twitter</Form.Label>
        <Form.Control
          type="text"
          value={form.twitter}
          placeholder="@"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          onChange={(e) => setForm({ ...form, twitter: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Farcaster</Form.Label>
        <Form.Control
          type="text"
          value={form.farcaster}
          placeholder="@"
          className="bg-white border border-2 border-dark rounded-4 py-3 px-3"
          onChange={(e) => setForm({ ...form, farcaster: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Telegram Group</Form.Label>
        <Form.Control
          type="text"
          value={form.telegram}
          placeholder="https://t.me/..."
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !!form.telegram && !form.telegram.startsWith("https://t.me/") ? "border-danger" : "border-dark"}`}
          isInvalid={
            validated &&
            !!form.telegram &&
            !form.telegram.startsWith("https://t.me/")
          }
          onChange={(e) => setForm({ ...form, telegram: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Discord Channel</Form.Label>
        <Form.Control
          type="text"
          value={form.discord}
          placeholder="https://discord.gg/..."
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !!form.discord && !form.discord.startsWith("https://discord") ? "border-danger" : "border-dark"}`}
          isInvalid={
            validated &&
            !!form.discord &&
            !form.discord.startsWith("https://discord")
          }
          onChange={(e) => setForm({ ...form, discord: e.target.value })}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Karma Profile</Form.Label>
        <Form.Control
          type="text"
          value={form.karmaProfile}
          placeholder="https://karmahq.xyz/project/..."
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${validated && !!form.karmaProfile && !form.karmaProfile.startsWith("https://") ? "border-danger" : "border-dark"}`}
          isInvalid={
            validated &&
            !!form.karmaProfile &&
            !form.karmaProfile.startsWith("https://")
          }
          onChange={(e) => setForm({ ...form, karmaProfile: e.target.value })}
        />
      </Form.Group>

      {/* Section 4: Technical */}
      <h4 className="fw-bold mb-4 mt-8">4. Technical</h4>
      <MultiInput
        label="Github Repositories"
        values={form.githubRepos}
        onChange={(values) => setForm({ ...form, githubRepos: values })}
        placeholder=""
        addLabel="Add Another"
        validate={isValidUrl}
        required
        validated={validated}
      />

      <SmartContractRow
        contracts={form.smartContracts}
        onChange={(contracts) =>
          setForm({ ...form, smartContracts: contracts })
        }
        validated={validated}
      />

      {/* Section 5: Additional */}
      <h4 className="fw-bold mb-4 mt-8">5. Additional</h4>
      <OtherLinkRow
        links={form.otherLinks}
        onChange={(links) => setForm({ ...form, otherLinks: links })}
        validated={validated}
      />

      {/* Submit */}
      <Stack direction="vertical" gap={3} className="mb-30">
        <Button
          disabled={validated && !isValid}
          className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
          onClick={handleSubmit}
        >
          {isSubmitting ? <Spinner size="sm" /> : "Save Project"}
        </Button>
        <Button
          variant="secondary"
          className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
          onClick={onCancel}
        >
          Back
        </Button>
        {error && <p className="text-danger fw-semi-bold">{error}</p>}
        {validated && !isValid && (
          <p className="text-danger fw-semi-bold">
            *Please complete the required fields.
          </p>
        )}
      </Stack>
    </Form>
  );
}
