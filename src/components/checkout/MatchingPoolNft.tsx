import Image from "next/image";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";

export type MatchingPoolNftProps = {
  isMinting: boolean;
  hasMinted: boolean;
  error: string;
  handleNftMint: () => void;
};

export default function MatchingPoolNft(props: MatchingPoolNftProps) {
  const { isMinting, hasMinted, handleNftMint, error } = props;

  return (
    <Card className="bg-lace-100 rounded-0 border-0 border-bottom border-white">
      <Image
        src="/octant-sqf-voter.png"
        alt="SQF Voter"
        width={148}
        height={148}
        className="m-auto"
      />
      <Card.Text as="span" className="mt-3 text-center">
        You've earned the Octant SQF Voter NFT. With it, your donations to
        grantees are matched quadratically—often over 100x!
      </Card.Text>
      <Button
        variant={hasMinted ? "success" : "primary"}
        className="mt-4 px-10 py-4 rounded-4 fw-semi-bold"
        onClick={handleNftMint}
        style={{ pointerEvents: isMinting || hasMinted ? "none" : "auto" }}
      >
        {hasMinted ? (
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-center text-light"
          >
            <Image
              src="/success.svg"
              alt="Success"
              width={24}
              height={24}
              style={{
                filter:
                  "invert(100%) sepia(2%) saturate(1117%) hue-rotate(180deg) brightness(114%) contrast(100%)",
              }}
            />
            Airdrop Confirmed
          </Stack>
        ) : isMinting ? (
          <Spinner size="sm" />
        ) : (
          "Claim NFT"
        )}
      </Button>
      {error && (
        <Card.Text className="m-0 mt-2 text-center small fw-semi-bold">
          {error}
        </Card.Text>
      )}
    </Card>
  );
}
