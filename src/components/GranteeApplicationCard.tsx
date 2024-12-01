import { useState, useEffect } from "react";
import { createVerifiedFetch } from "@helia/verified-fetch";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { IPFS_GATEWAYS } from "@/lib/constants";
import { getPlaceholderImageSrc } from "@/lib/utils";

type GranteeApplicationCardProps = {
  name: string;
  description: string;
  logoCid: string;
  bannerCid: string;
  status: Status | null;
  hasApplied: boolean;
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

  useEffect(() => {
    (async () => {
      const verifiedFetch = await createVerifiedFetch({
        gateways: IPFS_GATEWAYS,
      });

      if (logoCid) {
        try {
          const logoRes = await verifiedFetch(`ipfs://${logoCid}`);
          const logoBlob = await logoRes.blob();
          const logoUrl = URL.createObjectURL(logoBlob);

          setLogoUrl(logoUrl);
        } catch (err) {
          console.error(err);
        }
      }

      if (bannerCid) {
        try {
          const bannerRes = await verifiedFetch(`ipfs://${bannerCid}`);
          const bannerBlob = await bannerRes.blob();
          const bannerUrl = URL.createObjectURL(bannerBlob);

          setBannerUrl(bannerUrl);
        } catch (err) {
          console.error(err);
        }
      }
    })();
  }, [logoCid, bannerCid]);

  return (
    <Card
      className={`d-flex justify-content-center align-items-center border-2 fs-4 overflow-hidden cursor-pointer ${
        isSelected
          ? "border-5 border-primary"
          : status === "APPROVED"
            ? "border-5 border-success"
            : status === "REJECTED"
              ? "border-5 border-danger"
              : status === "PENDING"
                ? "border-5 border-warning"
                : ""
      } rounded-4
                    `}
      style={{
        height: 418,
        pointerEvents:
          (hasApplied && status !== "PENDING" && status !== "APPROVED") ||
          status === "REJECTED" ||
          status === "CANCELED"
            ? "none"
            : "auto",
      }}
      onClick={selectProject}
    >
      <Card.Img
        variant="top"
        src={bannerUrl === "" ? getPlaceholderImageSrc() : bannerUrl}
        height={102}
        className="bg-light"
      />
      <Image
        src={logoUrl === "" ? getPlaceholderImageSrc() : logoUrl}
        alt=""
        width={52}
        height={52}
        className="rounded-3 position-absolute border border-2 border-light bg-white"
        style={{ bottom: 288, left: 16 }}
      />
      {isTransactionConfirming && isSelected ? (
        <Spinner className="m-auto" />
      ) : (
        <>
          <Card.Body className="mt-3 pb-0">
            <Card.Text
              className="d-inline-block m-0 fs-5 word-wrap text-truncate"
              style={{ maxWidth: 256 }}
            >
              {name}
            </Card.Text>
            <Card.Text
              ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
              className="m-0 mb-3"
              style={{
                fontSize: "0.9rem",
                minHeight: noClamp ? "4lh" : "auto",
              }}
            >
              {clampedText}
            </Card.Text>
          </Card.Body>
          <Card.Footer
            className="d-flex justify-content-center w-100 bg-light border-0 py-3"
            style={{ fontSize: "15px" }}
          >
            {status !== null ? (
              <Stack
                direction="horizontal"
                gap={2}
                className={`justify-content-center align-items-center fs-4
                            ${
                              status === "PENDING"
                                ? "text-warning"
                                : status === "APPROVED"
                                  ? "text-success"
                                  : "text-danger"
                            }`}
                onClick={() => updateProject(status === "PENDING")}
              >
                <Image
                  src={
                    status === "PENDING"
                      ? "/pending.svg"
                      : status === "REJECTED" || status === "CANCELED"
                        ? "/cancel-circle.svg"
                        : "check-circle.svg"
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
                {status === "PENDING" && (
                  <Button
                    variant="transparent"
                    className="position-absolute end-0 px-3 border-0"
                    onClick={() => {
                      () => updateProject(true);
                    }}
                    style={{
                      filter:
                        "invert(87%) sepia(40%) saturate(4124%) hue-rotate(348deg) brightness(103%) contrast(110%)",
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
