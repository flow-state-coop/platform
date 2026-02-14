"use client";

import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Markdown from "@/components/Markdown";
import { ProjectDetails } from "@/types/project";

type ViewProjectTabProps = {
  projectDetails: ProjectDetails | null;
  managerAddresses?: string[];
  managerEmails?: string[];
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  projectAddress: "Project Address",
  goodCollectivePool: "GoodCollective Pool",
};

export default function ViewProjectTab(props: ViewProjectTabProps) {
  const { projectDetails, managerAddresses = [], managerEmails = [] } = props;

  if (!projectDetails) {
    return <p className="text-muted">No project data available.</p>;
  }

  return (
    <div>
      {/* Section 1: Admin */}
      <h4 className="fw-bold mb-4">1. Admin</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Project Name</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.name ?? ""}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Manager Addresses</Form.Label>
        <Stack direction="vertical" gap={2}>
          {managerAddresses.length > 0 ? (
            managerAddresses.map((address, index) => (
              <Form.Control
                key={index}
                type="text"
                value={address}
                disabled
                className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
              />
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Manager Emails</Form.Label>
        <Stack direction="vertical" gap={2}>
          {managerEmails.length > 0 ? (
            managerEmails.map((email, index) => (
              <Form.Control
                key={index}
                type="text"
                value={email}
                disabled
                className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
              />
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">
          Default Funding Address
        </Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.defaultFundingAddress ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 2: Basics */}
      <h4 className="fw-bold mb-4 mt-8">2. Basics</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Description</Form.Label>
        <div
          className="bg-light rounded-4 py-3 px-3"
          style={{ minHeight: 144 }}
        >
          <Markdown>{projectDetails.description ?? ""}</Markdown>
        </div>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Logo</Form.Label>
        {projectDetails.logoUrl ? (
          <div>
            <Image
              src={projectDetails.logoUrl}
              alt="Project Logo"
              width={80}
              height={80}
              className="rounded-4"
            />
          </div>
        ) : (
          <Form.Control
            type="text"
            value="N/A"
            disabled
            className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          />
        )}
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Banner</Form.Label>
        {projectDetails.bannerUrl ? (
          <div>
            <Image
              src={projectDetails.bannerUrl}
              alt="Project Banner"
              width={300}
              height={100}
              className="rounded-4"
            />
          </div>
        ) : (
          <Form.Control
            type="text"
            value="N/A"
            disabled
            className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
          />
        )}
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Website</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.website ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Demo/Application Link</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.demoUrl ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 3: Social */}
      <h4 className="fw-bold mb-4 mt-8">3. Social</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">X/Twitter</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.twitter ? `@${projectDetails.twitter}` : "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Farcaster</Form.Label>
        <Form.Control
          type="text"
          value={
            projectDetails.farcaster ? `@${projectDetails.farcaster}` : "N/A"
          }
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Telegram Group</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.telegram ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Discord Channel</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.discord ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Karma Profile</Form.Label>
        <Form.Control
          type="text"
          value={projectDetails.karmaProfile ?? "N/A"}
          disabled
          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
        />
      </Form.Group>

      {/* Section 4: Technical */}
      <h4 className="fw-bold mb-4 mt-8">4. Technical</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Github Repositories</Form.Label>
        <Stack direction="vertical" gap={2}>
          {projectDetails.githubRepos &&
          projectDetails.githubRepos.length > 0 ? (
            projectDetails.githubRepos.map((repo, index) => (
              <Form.Control
                key={index}
                type="text"
                value={repo}
                disabled
                className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
              />
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Smart Contracts</Form.Label>
        <Stack direction="vertical" gap={3}>
          {projectDetails.smartContracts &&
          projectDetails.smartContracts.length > 0 ? (
            projectDetails.smartContracts.map((contract, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <Stack direction="horizontal" gap={3} className="mb-2">
                  <span className="fw-semi-bold">
                    {CONTRACT_TYPE_LABELS[contract.type] ?? contract.type}
                  </span>
                  <span className="text-muted">({contract.network})</span>
                </Stack>
                <code className="d-block text-break">
                  {contract.address || "N/A"}
                </code>
              </div>
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>

      {/* Section 5: Additional */}
      <h4 className="fw-bold mb-4 mt-8">5. Additional</h4>
      <Form.Group className="mb-4">
        <Form.Label className="fs-lg fw-bold">Other Links</Form.Label>
        <Stack direction="vertical" gap={3}>
          {projectDetails.otherLinks && projectDetails.otherLinks.length > 0 ? (
            projectDetails.otherLinks.map((link, index) => (
              <div key={index} className="bg-light rounded-4 p-3">
                <span className="fw-semi-bold d-block mb-1">
                  {link.description || "N/A"}
                </span>
                <code className="d-block text-break">{link.url || "N/A"}</code>
              </div>
            ))
          ) : (
            <Form.Control
              type="text"
              value="N/A"
              disabled
              className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
            />
          )}
        </Stack>
      </Form.Group>
    </div>
  );
}
