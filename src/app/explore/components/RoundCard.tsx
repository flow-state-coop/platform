import { useRouter } from "next/navigation";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Stack from "react-bootstrap/Stack";

type RoundCardProps = {
  name: string;
  roundType: string;
  totalFunding?: string;
  tokenSymbol?: string;
  image: string;
  link: string;
};

export default function RoundCard(props: RoundCardProps) {
  const { name, roundType, totalFunding, tokenSymbol, image, link } = props;

  const router = useRouter();

  return (
    <Card
      className="border-0 rounded-4 shadow cursor-pointer"
      style={{ width: 360, height: 256 }}
      onClick={() =>
        totalFunding ? router.push(link) : window.open(link, "_blank")
      }
    >
      <Card.Header className="position-relative bg-transparent border-0 p-3">
        <Stack direction="horizontal" className="align-items-center">
          <Image
            src={image}
            alt=""
            width={38}
            height={38}
            className="position-absolute start-0 ms-2"
          />
          <Card.Title className="w-100 mb-1 fs-5 fw-bold text-center">
            {name}
          </Card.Title>
        </Stack>
        <Card.Text className="text-center fs-6">{roundType}</Card.Text>
      </Card.Header>
      <Card.Body>
        {totalFunding ? (
          <>
            <Card.Text className="fs-2 mb-1 fw-bold text-center">
              {totalFunding}+ {tokenSymbol}
            </Card.Text>
            <Card.Text className="fs-6 text-center">
              Total Funding Streamed
            </Card.Text>
          </>
        ) : (
          <Card.Text className="fs-2 fw-bold text-center">
            Coming Soon
          </Card.Text>
        )}
      </Card.Body>
      <Card.Footer className="bg-transparent border-0">
        <Stack
          direction="horizontal"
          gap={2}
          className="justify-content-end fw-bold"
        >
          <Image src="/sup.svg" alt="" width={32} height={32} />
          Rewards
        </Stack>
      </Card.Footer>
    </Card>
  );
}
