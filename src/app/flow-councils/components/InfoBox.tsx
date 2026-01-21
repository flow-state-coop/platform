"use client";

import Stack from "react-bootstrap/Stack";

type InfoBoxProps = {
  title: string;
  children: React.ReactNode;
  icon?: string;
};

export default function InfoBox(props: InfoBoxProps) {
  const { title, children, icon = "!" } = props;

  return (
    <div className="rounded-4 p-4 mb-4" style={{ backgroundColor: "#d4e8f2" }}>
      <Stack direction="horizontal" gap={2} className="mb-2 align-items-start">
        <span
          className="d-flex align-items-center justify-content-center rounded-circle fw-bold"
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            backgroundColor: "#f0ad4e",
            color: "#fff",
            fontSize: 14,
          }}
        >
          {icon}
        </span>
        <span className="fw-bold">{title}</span>
      </Stack>
      <div className="small">{children}</div>
    </div>
  );
}
