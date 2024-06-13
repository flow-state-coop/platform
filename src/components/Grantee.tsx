import { useState, useEffect } from "react";
import { createVerifiedFetch } from "@helia/verified-fetch";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { roundWeiAmount } from "@/lib/utils";
import { IPFS_GATEWAYS, SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeProps = {
  name: string;
  description: string;
  image: string;
  allocationFlowRate: bigint;
  allocatorsCount: number;
  matchingFlowRate: bigint;
  impactMatchingEstimate: bigint;
  donationToken: string;
  matchingToken: string;
};

export default function Grantee(props: GranteeProps) {
  const {
    name,
    description,
    image,
    allocationFlowRate,
    allocatorsCount,
    matchingFlowRate,
    impactMatchingEstimate,
    donationToken,
    matchingToken,
  } = props;

  const [imageUrl, setImageUrl] = useState("");

  const [descriptionRef, { clampedText }] = useClampText({
    text: description,
    ellipsis: "...",
  });
  const monthlyAllocation = roundWeiAmount(
    allocationFlowRate * BigInt(SECONDS_IN_MONTH),
    2,
  );
  const monthlyMatching = roundWeiAmount(
    matchingFlowRate * BigInt(SECONDS_IN_MONTH),
    2,
  );
  const monthlyImpactMatchingEstimate = roundWeiAmount(
    impactMatchingEstimate * BigInt(SECONDS_IN_MONTH),
    2,
  );

  useEffect(() => {
    (async () => {
      try {
        const verifiedFetch = await createVerifiedFetch({
          gateways: IPFS_GATEWAYS,
        });

        const res = await verifiedFetch(`ipfs://${image}`);
        const imageBlob = await res.blob();
        const imageUrl = URL.createObjectURL(imageBlob);

        setImageUrl(imageUrl);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [image]);

  return (
    <Card
      className="rounded-4 overflow-hidden"
      style={{ width: "320px", height: "280px" }}
    >
      <Card.Header>
        <Stack direction="horizontal" gap={4}>
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="logo"
              width={80}
              className="rounded-circle"
            />
          ) : (
            <Spinner className="ms-3 me-4" />
          )}
          <Stack direction="vertical" gap={2} className="">
            <Card.Text
              className="d-inline-block m-0 fs-5 word-wrap text-truncate"
              style={{ maxWidth: 200 }}
            >
              {name}
            </Card.Text>
            <Stack direction="horizontal">
              <Stack
                direction="vertical"
                gap={2}
                className="align-items-center"
              >
                <Card.Text className="m-0">{allocatorsCount}</Card.Text>
                <Image src="/hand.svg" alt="donations" width={20} />
              </Stack>
              <Stack direction="vertical" gap={2} className="w-75">
                <Card.Text className="m-0">
                  {monthlyAllocation} {donationToken}/mo
                </Card.Text>
                <Card.Text className="m-0">
                  {monthlyMatching} {matchingToken}/mo
                </Card.Text>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Card.Header>
      <Card.Body>
        <Card.Text
          ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
        >
          {clampedText}
        </Card.Text>
      </Card.Body>
      <Card.Footer className="d-flex justify-content-between">
        <Stack direction="vertical" className="w-50">
          <Card.Text className="m-0 fs-6 text-center">Multiplier</Card.Text>
          <Card.Text className="m-0 fs-6 fw-bold text-center">
            1 {donationToken} = {monthlyImpactMatchingEstimate} {matchingToken}
            /mo
          </Card.Text>
        </Stack>
        <Button variant="success" className="w-25 p-0">
          <Image
            src="/add.svg"
            alt="donate"
            width={24}
            style={{
              filter:
                "invert(98%) sepia(4%) saturate(112%) hue-rotate(260deg) brightness(118%) contrast(100%)",
            }}
          />
        </Button>
      </Card.Footer>
    </Card>
  );
}
