import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import { useMediaQuery } from "@/hooks/mediaQuery";

export default function RoundBannerSkeleton() {
  const { isMobile } = useMediaQuery();

  return (
    <div
      className="px-8 py-6 pool-info-background rounded-5 placeholder-glow"
      style={{ maxWidth: "100vw" }}
    >
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-center mb-2"
      >
        <Stack direction="horizontal" gap={1} className="w-100">
          <Card.Text className="m-0 fs-3 fw-semi-bold w-100">
            <span
              className="placeholder rounded col-5 bg-secondary"
              style={{ height: "1em" }}
            />
          </Card.Text>
        </Stack>
      </Stack>
      <Card.Text className="mb-8 fs-lg">
        <span className="placeholder rounded col-2 bg-secondary" />
      </Card.Text>
      {!isMobile && (
        <>
          <Table borderless className="fs-lg">
            <thead className="border-bottom border-dark">
              <tr>
                <th className="w-25 ps-0 bg-transparent text-dark">
                  Funding Token
                </th>
                <th className="w-25 bg-transparent text-dark">Monthly Flow</th>
                <th className="w-25 bg-transparent text-dark">Total Flow</th>
                <th className="w-25 bg-transparent text-dark">Funders</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="w-25 ps-0 bg-transparent">
                  <span className="placeholder rounded col-4 bg-secondary" />
                </td>
                <td className="w-25 bg-transparent">
                  <span className="placeholder rounded col-6 bg-secondary" />
                </td>
                <td className="w-25 bg-transparent">
                  <span className="placeholder rounded col-6 bg-secondary" />
                </td>
                <td className="w-25 bg-transparent">
                  <span className="placeholder rounded col-3 bg-secondary" />
                </td>
              </tr>
            </tbody>
          </Table>
          <Stack
            direction="horizontal"
            gap={4}
            className="justify-content-end w-100 mt-8"
          >
            <span
              className="placeholder rounded-4 bg-secondary"
              style={{ width: 240, height: 56 }}
            />
            <span
              className="placeholder rounded-4 bg-secondary"
              style={{ width: 240, height: 56 }}
            />
          </Stack>
        </>
      )}
    </div>
  );
}
