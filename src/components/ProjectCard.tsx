import { useState, useEffect } from "react";
import { useClampText } from "use-clamp-text";
import removeMarkdown from "remove-markdown";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { fetchIpfsImage } from "@/lib/fetchIpfs";
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
    text: removeMarkdown(description).replace(/\r?\n|\r/g, " "),
    ellipsis: "...",
    lines: 8,
  });

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
      className="rounded-4 border-5 border-dark overflow-hidden cursor-pointer shadow"
      style={{
        height: 418,
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
        className="rounded-3 position-absolute border border-4 border-white bg-white"
        style={{ bottom: 280, left: 16 }}
      />
      <Card.Body className="mt-6 p-4">
        <Card.Text
          className="d-inline-block m-0 lh-sm fs-lg fw-semi-bold word-wrap text-truncate"
          style={{ maxWidth: 256 }}
        >
          {name}
        </Card.Text>
        <Card.Text
          ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
          className="m-0 mb-3"
          style={{ minHeight: noClamp ? "4lh" : "auto" }}
        >
          {clampedText}
        </Card.Text>
      </Card.Body>
      <Card.Footer
        className="d-flex justify-content-between bg-lace-100 border-0 py-3"
        style={{ fontSize: "15px" }}
      >
        <Button
          variant="transparent"
          className="ms-auto border-0 p-4 rounded-4 fw-semi-bold"
          onClick={canEdit ? editProject : void 0}
        >
          <Image
            src={canEdit ? "/edit.svg" : "/view.svg"}
            alt="edit"
            width={28}
          />
        </Button>
      </Card.Footer>
    </Card>
  );
}
