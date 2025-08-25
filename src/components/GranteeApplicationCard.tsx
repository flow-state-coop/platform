import { useState, useEffect, useMemo } from "react";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
import { getPlaceholderImageSrc } from "@/lib/utils";

type GranteeApplicationCardProps = {
  name: string;
  description: string;
  logoCid: string;
  bannerCid: string;
  status: Status | null;
  hasApplied: boolean;
  canReapply?: boolean;
  isSelected: boolean;
  selectProject: () => void;
  updateProject: (shouldUpdate: boolean) => void;
  isTransactionConfirming: boolean;
};

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

export default function GranteeApplicationCard(
  props: GranteeApplicationCardProps,
) {
  const {
    name,
    description,
    logoCid,
    bannerCid,
    status,
    hasApplied,
    canReapply,
    isSelected,
    selectProject,
    updateProject,
    isTransactionConfirming,
  } = props;

  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 7,
  });

  const placeholderImgBanner = useMemo(() => getPlaceholderImageSrc(), []);

  const placeholderImgLogo = useMemo(() => getPlaceholderImageSrc(), []);

  useEffect(() => {
    (async () => {
      if (logoCid) {
        const logoUrl = await fetchIpfsImage(logoCid);

        setLogoUrl(logoUrl);
      }

      if (bannerCid) {
        const bannerUrl = await fetchIpfsImage(bannerCid);

        setBannerUrl(bannerUrl);
      }
    })();
  }, [logoCid, bannerCid]);

  return (
    <Card
      className={`d-flex justify-content-center align-items-center border-4 rounded-5 fs-lg overflow-hidden cursor-pointer ${
        isSelected &&
        (!hasApplied ||
          (canReapply && (status === "REJECTED" || status === "CANCELED")))
          ? "border-primary"
          : status === "APPROVED"
            ? "border-success"
            : status === "REJECTED"
              ? "border-danger"
              : status === "PENDING"
                ? "border-warning"
                : "border-dark"
      } rounded-4 shadow`}
      style={{
        height: 418,
        pointerEvents:
          hasApplied && !canReapply && status !== "PENDING" ? "none" : "auto",
      }}
      onClick={selectProject}
    >
      <Card.Img
        variant="top"
        src={bannerUrl === "" ? placeholderImgBanner : bannerUrl}
        height={102}
        className="bg-light"
      />
      <Image
        src={logoUrl === "" ? placeholderImgLogo : logoUrl}
        alt=""
        width={52}
        height={52}
        className="rounded-3 position-absolute border border-2 border-light bg-white"
        style={{ bottom: 282, left: 16 }}
      />
      {isTransactionConfirming && isSelected ? (
        <Spinner className="m-auto" />
      ) : (
        <>
          <Card.Body className="mt-6 pb-0">
            <Card.Text
              className="d-inline-block m-0 fs-6 fw-semi-bold word-wrap text-truncate"
              style={{ maxWidth: 256 }}
            >
              {name}
            </Card.Text>
            <Card.Text
              ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
              className="m-0 mb-3"
              style={{
                minHeight: noClamp ? "4lh" : "auto",
              }}
            >
              {clampedText}
            </Card.Text>
          </Card.Body>
          <Card.Footer
            className="d-flex justify-content-center w-100 bg-lace-100 border-0 px-3 py-4"
            style={{ fontSize: "15px" }}
          >
            {status !== null ? (
              <Stack
                direction="horizontal"
                gap={2}
                className={`justify-content-center align-items-center fs-6
                            ${
                              status === "PENDING"
                                ? "text-warning"
                                : status === "APPROVED"
                                  ? "text-success"
                                  : "text-danger"
                            }`}
                onClick={() =>
                  updateProject(status === "PENDING" || !!canReapply)
                }
              >
                <Image
                  src={
                    status === "PENDING"
                      ? "/pending.svg"
                      : status === "REJECTED" || status === "CANCELED"
                        ? "/cancel-circle.svg"
                        : "/check-circle.svg"
                  }
                  alt="status"
                  width={42}
                  style={{
                    filter:
                      status === "PENDING"
                        ? "invert(87%) sepia(40%) saturate(4124%) hue-rotate(348deg) brightness(103%) contrast(110%)"
                        : status === "REJECTED" || status === "CANCELED"
                          ? "invert(36%) sepia(58%) saturate(1043%) hue-rotate(313deg) brightness(89%) contrast(116%)"
                          : "invert(40%) sepia(14%) saturate(2723%) hue-rotate(103deg) brightness(97%) contrast(80%)",
                  }}
                />
                {status === "PENDING"
                  ? "Pending"
                  : status === "REJECTED"
                    ? "Rejected"
                    : status === "CANCELED"
                      ? "Canceled"
                      : "Accepted"}
                {(status === "PENDING" || canReapply) && (
                  <Button
                    variant="transparent"
                    className="position-absolute end-0 px-3 border-0"
                    onClick={() => {
                      () => updateProject(true);
                    }}
                    style={{
                      filter:
                        status === "PENDING"
                          ? "invert(87%) sepia(40%) saturate(4124%) hue-rotate(348deg) brightness(103%) contrast(110%)"
                          : "",
                    }}
                  >
                    <Image src="/edit.svg" alt="edit" width={28} />
                  </Button>
                )}
              </Stack>
            ) : (
              <Button
                variant="transparent"
                className="ms-auto p-0 border-0"
                onClick={() => updateProject(true)}
              >
                <Image src="/edit.svg" alt="edit" width={28} />
              </Button>
            )}
          </Card.Footer>
        </>
      )}
    </Card>
  );
}
