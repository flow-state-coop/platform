"use client";

import Form from "react-bootstrap/Form";

export type RecipientType = "individual" | "organization";

export type EligibilityForm = {
  commitment: {
    agreedToCommitments: boolean;
  };
  identity: {
    recipientType: RecipientType | null;
    legalName: string;
    country: string;
    address: string;
    contactEmail: string;
    fundingWallet: string;
    walletConfirmed: boolean;
  };
  dataAcknowledgement: {
    gdprConsent: boolean;
  };
};

type ViewEligibilityTabProps = {
  eligibilityData: EligibilityForm | null;
  previousTabIncomplete?: boolean;
};

const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  individual: "Individual",
  organization: "Organization",
};

export default function ViewEligibilityTab(props: ViewEligibilityTabProps) {
  const { eligibilityData, previousTabIncomplete } = props;

  if (previousTabIncomplete) {
    return (
      <p className="text-muted">
        Please complete the Round tab first to unlock this section.
      </p>
    );
  }

  if (!eligibilityData) {
    return <p className="text-muted">No eligibility data available.</p>;
  }

  const commitment = eligibilityData.commitment || {
    agreedToCommitments: false,
  };
  const identity = eligibilityData.identity || {
    recipientType: null as RecipientType | null,
    legalName: "",
    country: "",
    address: "",
    contactEmail: "",
    fundingWallet: "",
    walletConfirmed: false,
  };
  const dataAcknowledgement = eligibilityData.dataAcknowledgement || {
    gdprConsent: false,
  };

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
              : "N/A"
          }
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
          value={identity.legalName || "N/A"}
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
          value={identity.country || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Address</Form.Label>
        <Form.Control
          type="text"
          value={identity.address || "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Contact Email</Form.Label>
        <Form.Control
          type="text"
          value={identity.contactEmail || "N/A"}
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
          value={identity.fundingWallet || "N/A"}
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
    </div>
  );
}
