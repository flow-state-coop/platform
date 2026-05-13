import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";

export default function GranteeCardSkeleton() {
  return (
    <Card
      className="grantee-card rounded-5 border border-4 border-dark overflow-hidden shadow placeholder-glow"
      style={{ height: 430 }}
    >
      <div
        className="placeholder bg-secondary w-100"
        style={{ height: 102, borderRadius: 0 }}
      />
      <span
        className="placeholder position-absolute rounded-4 border border-4 border-white bg-secondary"
        style={{ width: 52, height: 52, bottom: 295, left: 16 }}
      />
      <Card.Body className="mt-5 p-4 pb-0">
        <Card.Text className="d-inline-block m-0 fs-lg fw-semi-bold w-100">
          <span className="placeholder rounded col-6 bg-secondary" />
        </Card.Text>
        <Card.Text style={{ fontSize: "0.9rem", minHeight: "4lh" }}>
          <span className="placeholder rounded col-12 bg-secondary mb-1" />
          <span className="placeholder rounded col-10 bg-secondary mb-1" />
          <span className="placeholder rounded col-8 bg-secondary" />
        </Card.Text>
        <Stack direction="horizontal" className="me-2">
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="mb-1">
              <span
                className="placeholder rounded bg-secondary"
                style={{ width: 64 }}
              />
            </Card.Text>
            <Card.Text as="small" className="m-0 fw-bold">
              <span
                className="placeholder rounded bg-secondary"
                style={{ width: 36 }}
              />
            </Card.Text>
          </Stack>
          <Stack direction="vertical" className="align-items-center w-33">
            <Card.Text as="small" className="mb-1">
              <span
                className="placeholder rounded bg-secondary"
                style={{ width: 80 }}
              />
            </Card.Text>
            <Card.Text as="small" className="m-0 fw-bold">
              <span
                className="placeholder rounded bg-secondary"
                style={{ width: 60 }}
              />
            </Card.Text>
          </Stack>
        </Stack>
      </Card.Body>
      <Card.Footer
        className="bg-lace-100 border-0 px-0 py-0 rounded-3"
        style={{ height: 52 }}
      />
    </Card>
  );
}
