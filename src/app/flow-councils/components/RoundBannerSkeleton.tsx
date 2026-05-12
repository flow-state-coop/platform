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
      <Card.Text
        className="m-0 mb-2 fs-3 fw-semi-bold"
        style={{ minHeight: isMobile ? "2em" : "1em" }}
      >
        <span
          className="placeholder rounded col-5 bg-secondary"
          style={{ height: "1em" }}
        />
      </Card.Text>
      <Card.Text className="mb-8 fs-lg">
        <span className="placeholder rounded col-2 bg-secondary" />
      </Card.Text>
      <Table borderless className="fs-lg">
        <thead className="border-bottom border-dark">
          <tr>
            <th className="w-25 ps-0 bg-transparent text-dark">
              {isMobile ? "Token" : "Funding Token"}
            </th>
            <th className="w-25 bg-transparent text-dark">
              {isMobile ? "Monthly" : "Monthly Flow"}
            </th>
            <th className="w-25 bg-transparent text-dark">
              {isMobile ? "Total" : "Total Flow"}
            </th>
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
        direction={isMobile ? "vertical" : "horizontal"}
        gap={4}
        className="justify-content-end w-100 mt-8"
      >
        <span
          className="placeholder rounded-4 bg-secondary"
          style={{ width: isMobile ? "100%" : 240, height: 56 }}
        />
        <span
          className="placeholder rounded-4 bg-secondary"
          style={{ width: isMobile ? "100%" : 240, height: 56 }}
        />
      </Stack>
    </div>
  );
}
