import Stack from "react-bootstrap/Stack";

function SkeletonCard() {
  return (
    <div
      className="card border-4 border-dark shadow rounded-5 px-4 py-2 placeholder-glow"
      style={{ width: 390, height: 280 }}
    >
      <div className="card-header bg-transparent border-0 p-3 text-center">
        <Stack direction="horizontal" className="align-items-center mb-1">
          <span
            className="placeholder rounded-3 bg-secondary"
            style={{ width: 38, height: 38, flexShrink: 0 }}
          />
          <span className="placeholder rounded col-7 bg-secondary mx-auto" />
        </Stack>
        <span className="placeholder rounded col-4 bg-secondary d-block mx-auto" />
      </div>
      <div className="card-body d-flex flex-column h-50 p-3 align-items-center">
        <span className="placeholder rounded col-8 bg-secondary mb-1 fs-5" />
        <span className="placeholder rounded col-6 bg-secondary mb-2" />
        <span className="placeholder rounded col-5 bg-secondary" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <Stack direction="vertical" className="explore-background pb-30">
      <style>{`
        .skeleton-grid {
          display: grid;
          column-gap: 1.5rem;
          row-gap: 3rem;
          justify-items: center;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        @media (max-width: 1400px) {
          .skeleton-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 992px) {
          .skeleton-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
        }
      `}</style>
      <Stack
        direction="vertical"
        gap={6}
        className="align-items-center px-2 py-17 px-lg-30 px-xxl-52 text-center"
      >
        <h1
          className="m-0 fw-bold"
          style={{ lineHeight: "95%", fontSize: 120 }}
        >
          Explore flows
        </h1>
        <h2 className="fs-6 mb-4">
          Participate in Flow State streaming funding campaigns or launch your
          own.
        </h2>
      </Stack>
      <div className="px-2 pb-20 px-lg-30 px-xxl-52">
        <span className="fs-4 fw-semi-bold">Active</span>
        <div className="skeleton-grid mt-2 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <span className="fs-4 fw-semi-bold">Completed</span>
        <div className="skeleton-grid mt-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </Stack>
  );
}
