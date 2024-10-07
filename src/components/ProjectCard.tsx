import { useState, useEffect } from "react";
import { createVerifiedFetch } from "@helia/verified-fetch";
import { useClampText } from "use-clamp-text";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { IPFS_GATEWAYS } from "@/lib/constants";
import { getPlaceholderImageSrc } from "@/lib/utils";

type ProjectCardProps = {
  name: string;
  description: string;
  logoCid: string;
  bannerCid: string;
  selectProject: () => void;
  editProject: () => void;
  canEdit: boolean;
};

export default function ProjectCard(props: ProjectCardProps) {
  const {
    name,
    description,
    logoCid,
    bannerCid,
    selectProject,
    editProject,
    canEdit,
  } = props;

  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const [descriptionRef, { noClamp, clampedText }] = useClampText({
    text: description,
    ellipsis: "...",
    lines: 8,
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
      className="rounded-4 overflow-hidden cursor-pointer"
      style={{
        height: 418,
        border: "1px solid #212529",
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
          style={{ fontSize: "0.9rem", minHeight: noClamp ? "4lh" : "auto" }}
        >
          {clampedText}
        </Card.Text>
      </Card.Body>
      <Card.Footer
        className="d-flex justify-content-between bg-light border-0 py-3"
        style={{ fontSize: "15px" }}
      >
        <Button
          variant="transparent"
          className="ms-auto p-0 border-0"
          onClick={canEdit ? editProject : void 0}
        >
          <Image
            src={canEdit ? "/edit.svg" : "/view.svg"}
            alt="edit"
            width={24}
          />
        </Button>
      </Card.Footer>
    </Card>
  );
}
