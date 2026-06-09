import Image from "react-bootstrap/Image";

// Platform-standard tx-button confirmation icon: the shared /success.svg
// recolored green via a CSS filter (matches Ballot / Funding / membership).
export default function SuccessCheckmark() {
  return (
    <Image
      src="/success.svg"
      alt="Success"
      width={20}
      height={20}
      style={{
        filter:
          "brightness(0) saturate(100%) invert(85%) sepia(8%) saturate(138%) hue-rotate(138deg) brightness(93%) contrast(106%)",
      }}
    />
  );
}
