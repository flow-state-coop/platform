"use client";

import Form from "react-bootstrap/Form";
import {
  type RecipientType,
  type AttestationForm,
  INITIAL_ATTESTATION_FORM,
} from "@/app/flow-councils/types/round";

type ViewAttestationTabProps = {
  attestationData: AttestationForm | null;
};

const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  individual: "Individual",
  organization: "Organization",
};

export default function ViewAttestationTab(props: ViewAttestationTabProps) {
  const { attestationData } = props;

  const commitment =
    attestationData?.commitment || INITIAL_ATTESTATION_FORM.commitment;
  const identity =
    attestationData?.identity || INITIAL_ATTESTATION_FORM.identity;
  const dataAcknowledgement =
    attestationData?.dataAcknowledgement ||
    INITIAL_ATTESTATION_FORM.dataAcknowledgement;
  const privacyTransparency =
    attestationData?.privacyTransparency ||
    INITIAL_ATTESTATION_FORM.privacyTransparency;

  return (
    <div>
      {/* Section 1: Commitment */}
      <h4 className="fw-bold mb-4">1. Commitment</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Agreed to Commitments</Form.Label>
        <Form.Control
          type="text"
          value={commitment.agreedToCommitments ? "Yes" : "No"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {commitment.agreedToCommitments && (
        <div className="bg-light rounded-4 p-3 mb-4">
          <p className="fw-semi-bold mb-2">
            If accepted into GoodBuilders, applicant agrees to:
          </p>
          <ul className="mb-0 ps-3">
            <li>
              Post progress and milestones updates on Flow State at least every
              2-3 weeks
            </li>
            <li>Join the Demo Days held throughout the round</li>
            <li>Join office hours when needed</li>
            <li>Share KPI data during and after the round</li>
            <li>
              Communicate promptly in the program&apos;s Telegram/Flow State
              channels
            </li>
            <li>Provide feedback to improve future rounds</li>
          </ul>
        </div>
      )}

      {/* Section 2: Identity & KYC */}
      <h4 className="fw-bold mb-4 mt-8">2. Identity & KYC</h4>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Recipient Type</Form.Label>
        <Form.Control
          type="text"
          value={
            identity.recipientType
              ? RECIPIENT_TYPE_LABELS[identity.recipientType]
              : ""
          }
          placeholder="Select recipient type"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          {identity.recipientType === "organization"
            ? "Company Name"
            : "Legal Name"}
        </Form.Label>
        <Form.Control
          type="text"
          value={identity.legalName}
          placeholder="Enter legal name"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          {identity.recipientType === "organization"
            ? "Country of Registration"
            : "Country of Residence"}
        </Form.Label>
        <Form.Control
          type="text"
          value={identity.country}
          placeholder="Select country"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Address</Form.Label>
        <Form.Control
          type="text"
          value={identity.address}
          placeholder="Enter address"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Contact Email</Form.Label>
        <Form.Control
          type="text"
          value={identity.contactEmail}
          placeholder="Enter contact email"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Wallet to Receive Funding
        </Form.Label>
        <Form.Control
          type="text"
          value={identity.fundingWallet}
          placeholder="Enter wallet address"
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Wallet Ownership Confirmed
        </Form.Label>
        <Form.Control
          type="text"
          value={identity.walletConfirmed ? "Yes" : "No"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 3: Data Acknowledgement */}
      <h4 className="fw-bold mb-4 mt-8">3. Data Acknowledgement</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">GDPR Consent</Form.Label>
        <Form.Control
          type="text"
          value={dataAcknowledgement.gdprConsent ? "Yes" : "No"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {dataAcknowledgement.gdprConsent && (
        <div className="bg-light rounded-4 p-3 mb-4">
          <p className="mb-0 small text-muted">
            Applicant has consented to the collection and use of their data for
            the purposes of participating in the GoodBuilders Round and
            receiving a grant via the Flow State platform. Data will be handled
            in accordance with GDPR and will not be shared outside of GoodDollar
            and its grant management partners.
          </p>
        </div>
      )}

      {/* Section 4: Privacy & Transparency */}
      <h4 className="fw-bold mb-4 mt-8">4. Privacy & Transparency</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Agreed to Privacy & Transparency
        </Form.Label>
        <Form.Control
          type="text"
          value={privacyTransparency.agreedToPrivacy ? "Yes" : "No"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {privacyTransparency.agreedToPrivacy && (
        <div className="bg-light rounded-4 p-3 mb-4">
          <p className="fw-semi-bold mb-2">
            By submitting this application, applicant acknowledges and agrees
            to:
          </p>
          <ul className="mb-0 ps-3">
            <li>
              <span className="fw-semi-bold">Public Accountability:</span>{" "}
              Project name, description, funding received, and key milestones
              may be made publicly visible
            </li>
            <li>
              <span className="fw-semi-bold">On-Chain Records:</span> Certain
              grant-related data may be recorded on-chain and are inherently
              public and immutable
            </li>
            <li>
              <span className="fw-semi-bold">Strategic Use of Data:</span>{" "}
              Aggregated, anonymized data may be used in reports, research, or
              communications
            </li>
            <li>
              <span className="fw-semi-bold">Confidentiality:</span> Sensitive
              personal data will remain confidential and used only for KYC and
              internal program management
            </li>
            <li>
              <span className="fw-semi-bold">Analytics & Communication:</span>{" "}
              Agrees to receive program updates and occasional communications
            </li>
            <li>
              <span className="fw-semi-bold">
                Marketing and Communications:
              </span>{" "}
              Project may be featured in public communications and marketing
              materials
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
