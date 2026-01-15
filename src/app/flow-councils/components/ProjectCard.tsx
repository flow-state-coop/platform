"use client";

import { useMemo } from "react";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { getPlaceholderImageSrc } from "@/lib/utils";

type ProjectCardProps = {
  name: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  status: Status | null;
  hasApplied: boolean;
  canReapply?: boolean;
  isSelected: boolean;
  selectProject: () => void;
  updateProject: () => void;
  isTransactionConfirming: boolean;
};

type Status =
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "GRADUATED"
  | "REMOVED"
  | "INCOMPLETE";

export default function ProjectCard(props: ProjectCardProps) {
  const {
    name,
    description,
    logoUrl,
    bannerUrl,
    status,
    hasApplied,
    canReapply,
    isSelected,
    selectProject,
    updateProject,
    isTransactionConfirming,
  } = props;

  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 4,
  });

  const placeholderImgBanner = useMemo(() => getPlaceholderImageSrc(), []);
  const placeholderImgLogo = useMemo(() => getPlaceholderImageSrc(), []);

  return (
    <Card
      className="rounded-5 border-4 overflow-hidden cursor-pointer shadow"
      style={{
        borderColor:
          isSelected &&
          (!hasApplied ||
            (canReapply && (status === "REJECTED" || status === "REMOVED")))
            ? "#056589" // $primary
            : status === "SUBMITTED"
              ? "#056589" // $primary
              : status === "ACCEPTED"
                ? "#45ad57" // $success
                : status === "CHANGES_REQUESTED"
                  ? "#ffc107" // yellow (warning)
                  : status === "REJECTED"
                    ? "#dc3545" // red (danger)
                    : status === "GRADUATED"
                      ? "#679a8b" // como-400
                      : status === "REMOVED"
                        ? "#888888" // $info
                        : status === "INCOMPLETE"
                          ? "#d95d39" // flame-500
                          : "#030303", // $dark (default)
        height: 430,
        pointerEvents:
          hasApplied && !canReapply && status !== "SUBMITTED" ? "none" : "auto",
        transition: "all 0.2s ease-in-out",
      }}
      onClick={selectProject}
    >
      <Card.Img
        variant="top"
        src={bannerUrl || placeholderImgBanner}
        height={102}
        className="bg-lace-100"
      />
      <Image
        src={logoUrl || placeholderImgLogo}
        alt=""
        width={52}
        height={52}
        className="rounded-4 position-absolute border border-4 border-white bg-white"
        style={{ bottom: 295, left: 16 }}
      />
      {isTransactionConfirming && isSelected ? (
        <Stack className="justify-content-center align-items-center flex-grow-1">
          <Spinner />
        </Stack>
      ) : (
        <>
          <Card.Body className="mt-5 p-4 pb-0">
            <Card.Text
              className="d-inline-block m-0 fs-lg fw-semi-bold word-wrap text-truncate"
              style={{ maxWidth: 256 }}
            >
              {name}
            </Card.Text>
            <Card.Text
              ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
              style={{
                fontSize: "0.9rem",
                minHeight: noClamp ? "4lh" : "auto",
              }}
            >
              {clampedText}
            </Card.Text>
          </Card.Body>
          <Card.Footer
            className="position-relative d-flex align-items-center bg-lace-100 border-0 px-0 py-0 rounded-3"
            style={{ height: 52 }}
          >
            {status !== null ? (
              <Stack
                direction="horizontal"
                gap={2}
                className="justify-content-center align-items-center w-100 fs-6"
                style={{
                  color:
                    status === "SUBMITTED"
                      ? "#056589" // $primary
                      : status === "ACCEPTED"
                        ? "#45ad57" // $success
                        : status === "CHANGES_REQUESTED"
                          ? "#ffc107" // yellow (warning)
                          : status === "REJECTED"
                            ? "#dc3545" // red (danger)
                            : status === "GRADUATED"
                              ? "#679a8b" // como-400
                              : status === "REMOVED"
                                ? "#888888" // $info
                                : status === "INCOMPLETE"
                                  ? "#d95d39" // flame-500
                                  : "#030303", // $dark
                }}
              >
                {status === "SUBMITTED"
                  ? "Submitted"
                  : status === "ACCEPTED"
                    ? "Accepted"
                    : status === "CHANGES_REQUESTED"
                      ? "Changes Requested"
                      : status === "REJECTED"
                        ? "Rejected"
                        : status === "GRADUATED"
                          ? "Graduated"
                          : status === "REMOVED"
                            ? "Removed"
                            : status === "INCOMPLETE"
                              ? "Incomplete"
                              : ""}
                {(status === "SUBMITTED" ||
                  status === "CHANGES_REQUESTED" ||
                  status === "INCOMPLETE" ||
                  canReapply) && (
                  <Button
                    variant="transparent"
                    className="position-absolute end-0 px-3 border-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateProject();
                    }}
                  >
                    <Image src="/edit.svg" alt="edit" width={24} />
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack
                direction="horizontal"
                className="justify-content-end w-100 pe-3"
              >
                <Button
                  variant="transparent"
                  className="p-0 border-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateProject();
                  }}
                >
                  <Image src="/edit.svg" alt="edit" width={24} />
                </Button>
              </Stack>
            )}
          </Card.Footer>
        </>
      )}
    </Card>
  );
}
