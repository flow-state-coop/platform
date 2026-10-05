import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { GOODBUILDERS_PAST_SEASONS } from "@/app/flow-councils/lib/pastSeasons";
import usePastSeasonQuery, {
  type PastSeasonProject,
} from "@/app/flow-councils/hooks/pastSeasonQuery";
import { formatNumber, generateColor } from "@/lib/utils";

const GRID_STYLE = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};

function formatAmount(amount: bigint) {
  return formatNumber(Number(formatEther(amount)));
}

function StatChip({ value, label }: { value: string; label?: string }) {
  return (
    <Stack
      direction="horizontal"
      gap={2}
      className="align-items-baseline bg-lace-100 rounded-4 px-4 py-3"
    >
      <span className="fs-4 fw-bold">{value}</span>
      {label && <span className="text-secondary">{label}</span>}
    </Stack>
  );
}

function ProjectLogo({ project }: { project: PastSeasonProject }) {
  if (project.logoUrl) {
    return (
      <Image
        src={project.logoUrl}
        alt=""
        width={40}
        height={40}
        className="rounded-3 flex-shrink-0 object-fit-cover"
      />
    );
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 fw-bold text-white"
      style={{
        width: 40,
        height: 40,
        background: generateColor(project.fundingAddress),
      }}
    >
      {project.name.charAt(0).toUpperCase()}
    </div>
  );
}

function ProjectCard({
  project,
  symbol,
}: {
  project: PastSeasonProject;
  symbol: string;
}) {
  return (
    <Link
      href={project.href}
      target={project.href.startsWith("http") ? "_blank" : undefined}
      className="d-block h-100 text-decoration-none text-dark"
    >
      <Stack
        direction="vertical"
        className={`grantee-card h-100 rounded-4 border border-3 p-4 ${project.isOffboarded ? "bg-lace-100 border-secondary" : "bg-white border-dark"}`}
        style={
          {
            transition: "all 0.2s ease-in-out",
            "--bs-border-style": project.isOffboarded ? "dashed" : "solid",
          } as React.CSSProperties
        }
      >
        <Stack
          direction="horizontal"
          gap={3}
          className="pb-3 mb-3 border-bottom"
        >
          <ProjectLogo project={project} />
          <span className="fw-bold lh-sm">{project.name}</span>
        </Stack>
        <small className="text-secondary">
          {project.isOffboarded ? "Streamed before exit" : "Total streamed"}
        </small>
        <span className="fw-bold">
          {formatAmount(project.totalStreamed)} {symbol}
        </span>
      </Stack>
    </Link>
  );
}

export default function PastSeasonsTab({
  chainId,
  tokenSymbol,
}: {
  chainId: number;
  tokenSymbol: string;
}) {
  const [selectedSeason, setSelectedSeason] = useState(
    GOODBUILDERS_PAST_SEASONS[0],
  );
  const { projects, isError } = usePastSeasonQuery(chainId, selectedSeason);

  const completed = projects?.filter((p) => !p.isOffboarded) ?? [];
  const offboarded = projects?.filter((p) => p.isOffboarded) ?? [];
  const totalStreamed = (projects ?? []).reduce(
    (sum, p) => sum + p.totalStreamed,
    BigInt(0),
  );

  return (
    <Stack direction="vertical" gap={6}>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        {GOODBUILDERS_PAST_SEASONS.map((season) => (
          <Button
            key={season.councilAddress}
            variant={
              season.councilAddress === selectedSeason.councilAddress
                ? "dark"
                : "outline-dark"
            }
            className="rounded-pill px-4 py-2 fw-bold border-2"
            onClick={() => setSelectedSeason(season)}
          >
            {season.name}
          </Button>
        ))}
      </Stack>
      {isError ? (
        <div className="text-center py-10 fs-5 text-secondary">
          Couldn&apos;t load this season
        </div>
      ) : !projects ? (
        <Stack className="align-items-center py-10">
          <Spinner />
        </Stack>
      ) : (
        <>
          <Stack direction="horizontal" gap={3} className="flex-wrap">
            <StatChip value={String(completed.length)} label="completed" />
            {offboarded.length > 0 && (
              <StatChip value={String(offboarded.length)} label="offboarded" />
            )}
            <StatChip
              value={`${formatAmount(totalStreamed)} ${tokenSymbol}`}
              label="streamed"
            />
            <StatChip value={selectedSeason.period} />
          </Stack>
          {completed.length > 0 && (
            <Stack direction="vertical" gap={3}>
              <h2 className="fs-4 fw-bold m-0">Completed the season</h2>
              <div style={GRID_STYLE}>
                {completed.map((project) => (
                  <ProjectCard
                    key={project.fundingAddress}
                    project={project}
                    symbol={tokenSymbol}
                  />
                ))}
              </div>
            </Stack>
          )}
          {offboarded.length > 0 && (
            <Stack direction="vertical" gap={3}>
              <h2 className="fs-4 fw-bold m-0">Offboarded</h2>
              <div style={GRID_STYLE}>
                {offboarded.map((project) => (
                  <ProjectCard
                    key={project.fundingAddress}
                    project={project}
                    symbol={tokenSymbol}
                  />
                ))}
              </div>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
