"use client";

import Image from "next/image";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";

export default function FlowQF() {
  return (
    <Stack
      direction="vertical"
      gap={4}
      className="align-items-center justify-content-center min-vh-100 px-4 py-10"
    >
      <Image
        src="/octant-circle.svg"
        alt="Octant"
        width={120}
        height={120}
        className="mb-4"
      />
      <Card
        className="border-4 border-dark rounded-4 p-4"
        style={{ maxWidth: 600 }}
      >
        <Card.Body className="text-center">
          <Card.Title className="fs-4 fw-bold mb-4">Round Concluded</Card.Title>
          <Card.Text className="fs-6 mb-4">
            The Octant Builder Accelerator SQF round has concluded.
          </Card.Text>
          <Card.Text className="fs-6">
            Any streams left open are still directed to the builders, but we
            recommend that you close them. Close them in the Base - ETHx section
            on the{" "}
            <a
              href="https://app.superfluid.finance"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary"
            >
              Superfluid App
            </a>
            .
          </Card.Text>
        </Card.Body>
      </Card>
    </Stack>
  );
}
