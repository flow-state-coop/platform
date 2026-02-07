"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Toast from "react-bootstrap/Toast";
import useAuthSubmit from "@/app/flow-councils/hooks/authSubmit";
import {
  type RoundForm,
  type AttestationForm,
  INITIAL_ATTESTATION_FORM,
} from "@/app/flow-councils/types/round";

const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

type AttestationTabProps = {
  chainId: number;
  councilId: string;
  projectId: number;
  applicationId: number | null;
  csrfToken: string;
  defaultFundingAddress: string;
  existingAttestationData: AttestationForm | null;
  existingRoundData: RoundForm | null;
  isLoading: boolean;
  onBack: () => void;
};

export default function AttestationTab(props: AttestationTabProps) {
  const {
    chainId,
    councilId,
    applicationId,
    csrfToken,
    defaultFundingAddress,
    existingAttestationData,
    existingRoundData,
    isLoading,
    onBack,
  } = props;

  const router = useRouter();
  const [form, setForm] = useState<AttestationForm>(INITIAL_ATTESTATION_FORM);
  const [validated, setValidated] = useState(false);
  const [touched, setTouched] = useState({
    legalName: false,
    country: false,
    address: false,
    contactEmail: false,
    fundingWallet: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const {
    address,
    session,
    handleSubmit: authSubmit,
  } = useAuthSubmit(chainId, csrfToken);

  useEffect(() => {
    if (existingAttestationData) {
      setForm({
        ...INITIAL_ATTESTATION_FORM,
        ...existingAttestationData,
      });
    }
  }, [existingAttestationData]);

  // Validation
  const isCommitmentValid = form.commitment.agreedToCommitments === true;

  const isIdentityValid =
    form.identity.recipientType !== null &&
    form.identity.legalName.trim() !== "" &&
    form.identity.country.trim() !== "" &&
    form.identity.address.trim() !== "" &&
    form.identity.contactEmail.trim() !== "" &&
    isValidEmail(form.identity.contactEmail) &&
    form.identity.fundingWallet.trim() !== "" &&
    isAddress(form.identity.fundingWallet) &&
    form.identity.walletConfirmed === true;

  const isDataAcknowledgementValid =
    form.dataAcknowledgement.gdprConsent === true;

  const isPrivacyTransparencyValid =
    form.privacyTransparency.agreedToPrivacy === true;

  const isValid =
    isCommitmentValid &&
    isIdentityValid &&
    isDataAcknowledgementValid &&
    isPrivacyTransparencyValid;

  // Handle "Use your project default" link
  const handleUseDefaultFunding = () => {
    setForm({
      ...form,
      identity: {
        ...form.identity,
        fundingWallet: defaultFundingAddress,
      },
    });
  };

  const handleSubmitApplication = async () => {
    if (!session?.address) throw Error("Account is not signed in");
    if (!applicationId) throw Error("Application ID not found");

    try {
      setIsSubmitting(true);
      setError("");

      // Merge round data with attestation data
      const combinedDetails = {
        ...existingRoundData,
        attestation: form,
      };

      const res = await fetch(
        `/api/flow-council/applications/${applicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            details: combinedDetails,
            fundingAddress: form.identity.fundingWallet,
            submit: true,
          }),
        },
      );

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Failed to submit application");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setSuccess(true);
      router.push(`/flow-councils/application/${chainId}/${councilId}`);
    } catch (err) {
      console.error(err);
      setError("Failed to submit application");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    authSubmit(isValid, setValidated, handleSubmitApplication);
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
      {/* Section 1: Commitment */}
      <h4 className="fw-bold mb-4">1. Commitment*</h4>
      <Form.Check
        type="checkbox"
        id="commitment-agree"
        className="mb-3"
        checked={form.commitment.agreedToCommitments}
        isInvalid={validated && !form.commitment.agreedToCommitments}
        onChange={(e) =>
          setForm({
            ...form,
            commitment: { agreedToCommitments: e.target.checked },
          })
        }
        label={
          <span className="fw-bold">
            If accepted into GoodBuilders, I agree to:
          </span>
        }
      />
      <ul className="mb-3 ps-4">
        <li>
          Post progress and milestones updates on Flow State at least every 2-3
          weeks
        </li>
        <li>Join the Demo Days held throughout the round</li>
        <li>Join office hours when needed</li>
        <li>Share KPI data during and after the round</li>
        <li>
          Communicate promptly in the program&apos;s Telegram/Flow State
          channels (questions, blockers, check-ins)
        </li>
        <li>Provide feedback to improve future rounds</li>
      </ul>
      <p className="text-muted small mb-4">
        These commitments help us build and grow together as a community. They
        create visibility around your progress, make collaboration easier, and
        ensure we can support each team effectively throughout the round.
      </p>

      {/* Section 2: Identity & KYC */}
      <h4 className="fw-bold mb-4 mt-8">2. Identity & KYC*</h4>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Recipient Type</Form.Label>
        <Stack direction="horizontal" gap={4}>
          <Form.Check
            type="radio"
            id="recipient-individual"
            name="recipientType"
            label="Individual"
            checked={form.identity.recipientType === "individual"}
            isInvalid={validated && form.identity.recipientType === null}
            onChange={() =>
              setForm({
                ...form,
                identity: { ...form.identity, recipientType: "individual" },
              })
            }
          />
          <Form.Check
            type="radio"
            id="recipient-organization"
            name="recipientType"
            label="Organization"
            checked={form.identity.recipientType === "organization"}
            isInvalid={validated && form.identity.recipientType === null}
            onChange={() =>
              setForm({
                ...form,
                identity: { ...form.identity, recipientType: "organization" },
              })
            }
          />
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          {form.identity.recipientType === "organization"
            ? "Company Name"
            : "Legal Name"}
        </Form.Label>
        <Form.Control
          type="text"
          value={form.identity.legalName}
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${(validated || touched.legalName) && !form.identity.legalName.trim() ? "border-danger" : "border-dark"}`}
          isInvalid={
            (validated || touched.legalName) && !form.identity.legalName.trim()
          }
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, legalName: e.target.value },
            })
          }
          onBlur={() => setTouched((prev) => ({ ...prev, legalName: true }))}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          {form.identity.recipientType === "organization"
            ? "Country of registration"
            : "Country of residence"}
        </Form.Label>
        <Form.Control
          type="text"
          value={form.identity.country}
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${(validated || touched.country) && !form.identity.country.trim() ? "border-danger" : "border-dark"}`}
          isInvalid={
            (validated || touched.country) && !form.identity.country.trim()
          }
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, country: e.target.value },
            })
          }
          onBlur={() => setTouched((prev) => ({ ...prev, country: true }))}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Address</Form.Label>
        <Form.Control
          type="text"
          value={form.identity.address}
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${(validated || touched.address) && !form.identity.address.trim() ? "border-danger" : "border-dark"}`}
          isInvalid={
            (validated || touched.address) && !form.identity.address.trim()
          }
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, address: e.target.value },
            })
          }
          onBlur={() => setTouched((prev) => ({ ...prev, address: true }))}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Contact Email</Form.Label>
        <Form.Control
          type="email"
          value={form.identity.contactEmail}
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${(validated || touched.contactEmail) && (!form.identity.contactEmail.trim() || !isValidEmail(form.identity.contactEmail)) ? "border-danger" : "border-dark"}`}
          isInvalid={
            (validated || touched.contactEmail) &&
            (!form.identity.contactEmail.trim() ||
              !isValidEmail(form.identity.contactEmail))
          }
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, contactEmail: e.target.value },
            })
          }
          onBlur={() => setTouched((prev) => ({ ...prev, contactEmail: true }))}
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Stack direction="horizontal" gap={2} className="mb-1">
          <Form.Label className="fs-lg fw-bold mb-0">
            Wallet to receive funding
          </Form.Label>
          {defaultFundingAddress && (
            <Button
              variant="link"
              className="p-0 text-decoration-underline fw-semi-bold text-primary"
              onClick={handleUseDefaultFunding}
            >
              (Use your project default)
            </Button>
          )}
        </Stack>
        <Form.Control
          type="text"
          value={form.identity.fundingWallet}
          placeholder="0x..."
          className={`bg-white border border-2 rounded-4 py-3 px-3 ${(validated || touched.fundingWallet) && (!form.identity.fundingWallet.trim() || !isAddress(form.identity.fundingWallet)) ? "border-danger" : "border-dark"}`}
          isInvalid={
            (validated || touched.fundingWallet) &&
            (!form.identity.fundingWallet.trim() ||
              !isAddress(form.identity.fundingWallet))
          }
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, fundingWallet: e.target.value },
            })
          }
          onBlur={() =>
            setTouched((prev) => ({ ...prev, fundingWallet: true }))
          }
        />
        <Form.Control.Feedback type="invalid">
          Please enter a valid ETH address
        </Form.Control.Feedback>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Check
          type="checkbox"
          id="wallet-confirm"
          label="I confirm the wallet belongs to the named individual or organization.*"
          checked={form.identity.walletConfirmed}
          isInvalid={validated && !form.identity.walletConfirmed}
          onChange={(e) =>
            setForm({
              ...form,
              identity: { ...form.identity, walletConfirmed: e.target.checked },
            })
          }
        />
      </Form.Group>

      {/* Section 3: Data Acknowledgement */}
      <h4 className="fw-bold mb-4 mt-8">3. Data Acknowledgement*</h4>
      <Form.Group className="mb-4">
        <Form.Check
          type="checkbox"
          id="gdpr-consent"
          checked={form.dataAcknowledgement.gdprConsent}
          isInvalid={validated && !form.dataAcknowledgement.gdprConsent}
          onChange={(e) =>
            setForm({
              ...form,
              dataAcknowledgement: { gdprConsent: e.target.checked },
            })
          }
          label={
            <>
              I consent to the collection and use of my data for the purposes of
              participating in the GoodBuilders Round 3 and receiving a grant
              via the Flow State platform. I understand that my data will be
              handled in accordance with GDPR and will not be shared outside of
              GoodDollar and its grant management partners.
              <br />
              <br />I also agree to be contacted by the GoodDollar team with
              relevant updates, including program communications and occasional
              newsletters. I can unsubscribe at any time.
            </>
          }
        />
      </Form.Group>

      {/* Section 4: Privacy & Transparency */}
      <h4 className="fw-bold mb-4 mt-8">4. Privacy & Transparency*</h4>
      <Form.Check
        type="checkbox"
        id="privacy-agree"
        className="mb-3"
        checked={form.privacyTransparency.agreedToPrivacy}
        isInvalid={validated && !form.privacyTransparency.agreedToPrivacy}
        onChange={(e) =>
          setForm({
            ...form,
            privacyTransparency: { agreedToPrivacy: e.target.checked },
          })
        }
        label={
          <span className="fw-bold">
            By submitting this application, I acknowledge and agree to the
            following:
          </span>
        }
      />
      <ul className="mb-6 ps-4">
        <li>
          <span className="fw-semi-bold">Public Accountability:</span>{" "}
          GoodDollar is a decentralized protocol; as such, project names,
          mission statements, and high-level milestones will be shared publicly
          on the GoodDAO Governance Forum and the GoodDollar website to
          facilitate community transparency.
        </li>
        <li>
          <span className="fw-semi-bold">On-Chain Records:</span> All fund
          transfers associated with this grant are executed on-chain. You
          acknowledge that public wallet addresses and transaction hashes
          (TxIDs) are permanent, public records that cannot be deleted or
          altered.
        </li>
        <li>
          <span className="fw-semi-bold">Strategic Use of Data:</span>{" "}
          Non-sensitive data provided may be used in user research sessions and
          narrative testing to refine the protocol’s economic framework and
          external positioning.
        </li>
        <li>
          <span className="fw-semi-bold">Confidentiality:</span> Personal
          contact information, detailed internal budgets, and proprietary
          technical information will be kept confidential and accessible only to
          the GoodLabs operational team for due diligence purposes.
        </li>
        <li>
          <span className="fw-semi-bold">Analytics:</span> We use
          industry-standard tools for SEO and analytics to monitor the impact of
          our builder ecosystem; your public-facing project data may be
          processed through these platforms.
        </li>
        <li>
          <span className="fw-semi-bold">Marketing and Communications:</span> By
          submitting this form, you agree and consent that we may use your
          provided project’s name and description, specifically relating to your
          submission and grant, in GoodDollar’s public communications, media,
          advertisements, and other materials.
        </li>
        <li>
          Please note that any information you share with us regarding your Good
          Builders Grant application will be collected, retained, and used in
          accordance with applicable laws and regulations. Such information will
          be used primarily to assess applications, manage the Good Builders
          Grant program, and comply with applicable financial reporting
          requirements; therefore, it shall be retained for the periods required
          to meet these obligations. As a general rule, we will not store or use
          information for longer than required by applicable regulations, and
          will not commercially share such information with third parties (other
          than with affiliates, consultants, and advisors for the purposes
          mentioned above).
        </li>
      </ul>

      {/* Navigation */}
      <Stack direction="vertical" gap={3} className="mb-30">
        <Stack direction="horizontal" gap={3}>
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            style={{ backgroundColor: "#45ad57", borderColor: "#45ad57" }}
            onClick={onBack}
          >
            Back
          </Button>
          {!session || session.address !== address ? (
            <Button
              className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
              onClick={handleSubmit}
            >
              Sign In With Ethereum
            </Button>
          ) : (
            <Button
              disabled={validated && !isValid}
              className="fs-lg fw-semi-bold rounded-4 py-4"
              style={{ width: 140 }}
              onClick={handleSubmit}
            >
              {isSubmitting ? <Spinner size="sm" /> : "Submit"}
            </Button>
          )}
        </Stack>
        <Toast
          show={success}
          delay={4000}
          autohide={true}
          onClose={() => setSuccess(false)}
          className="bg-success py-2 px-3 fw-semi-bold fs-6 text-white m-0"
        >
          Application submitted successfully!
        </Toast>
        {error && <p className="text-danger fw-semi-bold m-0">{error}</p>}
        {validated && !isValid && (
          <p className="text-danger fw-semi-bold m-0">
            *Please complete the required fields.
          </p>
        )}
      </Stack>
    </Form>
  );
}
