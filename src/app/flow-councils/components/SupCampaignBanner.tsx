"use client";

import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";

const LEARN_MORE_URL =
  "https://x.com/gooddollarorg/status/2086874244156362929?s=20";

export default function SupCampaignBanner() {
  return (
    <Stack
      direction="horizontal"
      gap={3}
      className="align-items-center mb-4 px-4 py-3 bg-light border border-2 border-dark rounded-4 lh-sm"
    >
      <Image
        src="/sup.svg"
        alt="SUP"
        width={36}
        height={36}
        className="flex-shrink-0"
      />
      <Card.Text className="m-0 fs-lg">
        Stream G$ to the GoodBuilders S4 Flow Council to earn $SUP:{" "}
        <Card.Link
          href={LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more
        </Card.Link>
        .
      </Card.Text>
    </Stack>
  );
}
