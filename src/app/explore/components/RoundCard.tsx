import Link from "next/link";
import { formatEther } from "viem";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Stack from "react-bootstrap/Stack";
import useFlowingAmount from "@/hooks/flowingAmount";
import { formatNumber } from "@/lib/utils";

type RoundCardProps = {
  name: string;
  roundType: string;
  tokenSymbol?: string;
  image: string;
  link: string;
  totalStreamedUntilUpdatedAt?: string;
  flowRate?: string;
  updatedAt?: number;
  activeStreamCount?: number;
  showSupRewards?: boolean;
};

export default function RoundCard(props: RoundCardProps) {
  const {
    name,
    roundType,
    tokenSymbol,
    image,
    link,
    totalStreamedUntilUpdatedAt,
    flowRate,
    updatedAt,
    activeStreamCount,
    showSupRewards = false,
  } = props;

  const totalAmountStreamed = useFlowingAmount(
    BigInt(totalStreamedUntilUpdatedAt ?? 0),
    updatedAt ?? 0,
    BigInt(flowRate ?? 0),
  );

  return (
    <Link
      href={link}
      target={link.startsWith("https://") ? "_blank" : "_self"}
      className="text-decoration-none"
    >
      <Card
        className="border-4 border-dark shadow rounded-5 cursor-pointer px-4 py-2"
        style={{ width: 390, height: 280 }}
      >
        <Card.Header className="position-relative bg-transparent border-0 p-3">
          <Stack direction="horizontal" className="align-items-center">
            <Image
              src={image}
              alt=""
              width={38}
              height={38}
              className="position-absolute start-0 rounded-3"
            />
            <Card.Title className="w-100 fs-lg fw-bold text-center">
              {name}
            </Card.Title>
          </Stack>
          <Card.Text className="text-center fs-md m-0">{roundType}</Card.Text>
        </Card.Header>
        <Card.Body className="d-flex flex-column h-50 p-3">
          {totalAmountStreamed ? (
            <>
              <Card.Text className="fs-5 mb-1 fw-bold text-center">
                {formatNumber(
                  Number(formatEther(totalAmountStreamed)),
                  tokenSymbol === "ETHx" ? 6 : 2,
                )}{" "}
                {tokenSymbol}
              </Card.Text>
              <Card.Text className="fs-md text-center mb-2">
                Total Funding Streamed
              </Card.Text>
              <Card.Text className="text-center fw-semi-bold m-0">
                {!!activeStreamCount && `${activeStreamCount} active streams`}
              </Card.Text>
            </>
          ) : (
            <Card.Text className="fs-5 fw-bold text-center">
              Coming Soon
            </Card.Text>
          )}
          {showSupRewards && (
            <Card.Footer className="d-flex justify-content-end bg-transparent border-0 mt-auto">
              <Image src="/sup.svg" alt="SUP" width={42} height={42} />
            </Card.Footer>
          )}
        </Card.Body>
      </Card>
    </Link>
  );
}
