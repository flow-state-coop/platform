"use client";

import Image from "react-bootstrap/Image";
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";

type ProfilePicProps = {
  address: string;
  ensAvatar?: string | null;
  imageUrl?: string | null;
  size?: number;
};

export default function ProfilePic(props: ProfilePicProps) {
  const { address, ensAvatar, imageUrl, size = 32 } = props;

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-circle"
        style={{ objectFit: "cover" }}
      />
    );
  }

  if (ensAvatar) {
    return (
      <Image
        src={ensAvatar}
        alt=""
        width={size}
        height={size}
        className="rounded-circle"
        style={{ objectFit: "cover" }}
      />
    );
  }

  return (
    <span style={{ width: size, height: size }}>
      <Jazzicon
        paperStyles={{ border: "1px solid black" }}
        diameter={size}
        seed={jsNumberForAddress(address)}
      />
    </span>
  );
}
