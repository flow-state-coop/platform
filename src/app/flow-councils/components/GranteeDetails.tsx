import { Address, formatEther } from "viem";
import { useReadContract } from "wagmi";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Markdown from "@/components/Markdown";
import { Token } from "@/types/token";
import { superfluidPoolAbi } from "@/lib/abi/superfluidPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import useFlowCouncil from "../hooks/flowCouncil";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { truncateStr, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { ProjectDetails } from "@/types/project";

type GranteeDetailsProps = {
  id: string;
  details: ProjectDetails;
  placeholderLogo: string;
  granteeAddress: `0x${string}`;
  chainId: number;
  token: Token;
  canAddToBallot: boolean;
  hide: () => void;
};

export default function GranteeDetails(props: GranteeDetailsProps) {
  const {
    id,
    details,
    token,
    placeholderLogo,
    granteeAddress,
    chainId,
    canAddToBallot,
    hide,
  } = props;

  const { isMobile } = useMediaQuery();
  const { newBallot, dispatchNewBallot, distributionPool } = useFlowCouncil();
  const { data: totalAmountReceivedByMember, dataUpdatedAt } = useReadContract({
    chainId,
    address: distributionPool?.id as Address,
    abi: superfluidPoolAbi,
    functionName: "getTotalAmountReceivedByMember",
    args: [granteeAddress as Address],
    query: { enabled: !!distributionPool && !!granteeAddress },
  });

  const poolMember = distributionPool?.poolMembers.find(
    (m) => m.account.id === granteeAddress.toLowerCase(),
  );
  const adjustedPoolFlowRate = distributionPool
    ? BigInt(distributionPool.flowRate) -
      BigInt(distributionPool.adjustmentFlowRate)
    : BigInt(0);
  const memberFlowRate =
    poolMember && distributionPool && BigInt(distributionPool.totalUnits) > 0
      ? (BigInt(poolMember.units) * adjustedPoolFlowRate) /
        BigInt(distributionPool.totalUnits)
      : BigInt(0);
  const totalFundingReceived = useFlowingAmount(
    totalAmountReceivedByMember ?? BigInt(0),
    dataUpdatedAt ? Math.round(dataUpdatedAt / 1000) : 0,
    memberFlowRate,
  );
  const superfluidExplorer = networks.find(
    (network) => network.id === chainId,
  )?.superfluidExplorer;

  return (
    <Offcanvas
      show
      onHide={hide}
      placement={isMobile ? "bottom" : "end"}
      className="p-4"
      style={{ height: "100%" }}
    >
      <Offcanvas.Header closeButton className="pb-0">
        <Offcanvas.Title className="fs-5 fw-semi-bold">
          Recipient Details
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4">
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-center my-3"
          >
            <a
              href={`/projects/${id}`}
              target="_blank"
              rel="noreferrer"
              className="ms-2"
            >
              <Image
                src={details.logoUrl || placeholderLogo}
                alt=""
                width={96}
                height={96}
                className="rounded-4"
              />
            </a>
            <Card className="bg-transparent border-0 ms-3">
              <Card.Title className="fw-semi-bold m-0">
                <a
                  href={`/projects/${id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-secondary text-decoration-none"
                >
                  {details.name}
                </a>
              </Card.Title>
              <Card.Subtitle className="m-0">
                <Card.Link
                  href={`${superfluidExplorer}/accounts/${granteeAddress}`}
                  target="_blank"
                  className="text-info"
                >
                  {truncateStr(granteeAddress, 12)}
                </Card.Link>
              </Card.Subtitle>
            </Card>
          </Stack>
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-end text-info px-2 mb-2"
          >
            {!!details.website && (
              <Button
                variant="link"
                href={`https://${details.website}`}
                target="_blank"
                className="p-0"
              >
                <Image src="/web.svg" alt="Website" width={20} height={20} />
              </Button>
            )}
            {!!details.demoUrl && (
              <Button
                variant="link"
                href={details.demoUrl}
                target="_blank"
                className="p-0"
              >
                <Image src="/link.svg" alt="Demo" width={18} height={18} />
              </Button>
            )}
            {!!details.twitter && (
              <Button
                variant="link"
                href={`https://x.com/${details.twitter}`}
                target="_blank"
                className="p-0"
              >
                <Image src="/x-logo.svg" alt="X" width={13} height={13} />
              </Button>
            )}
            {!!details.farcaster && (
              <Button
                variant="link"
                href={`https://farcaster.xyz/${details.farcaster}`}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/farcaster.svg"
                  alt="Farcaster"
                  width={16}
                  height={16}
                />
              </Button>
            )}
            {!!details.telegram && (
              <Button
                variant="link"
                href={details.telegram}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/telegram.svg"
                  alt="Telegram"
                  width={16}
                  height={16}
                />
              </Button>
            )}
            {!!details.discord && (
              <Button
                variant="link"
                href={details.discord}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/discord.svg"
                  alt="Discord"
                  width={16}
                  height={16}
                />
              </Button>
            )}
            {!!details.karmaProfile && (
              <Button
                variant="link"
                href={details.karmaProfile}
                target="_blank"
                className="p-0"
              >
                <Image
                  src="/karma-gap.svg"
                  alt="Karma"
                  width={18}
                  height={18}
                />
              </Button>
            )}
          </Stack>
          <Stack direction="horizontal" gap={1} className="p-2 pb-0">
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-nowrap text-center">
                Votes
              </Card.Text>
              <Badge className="bg-secondary rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(Number(poolMember?.units ?? 0))}
              </Badge>
            </Stack>
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-center">
                {token.symbol}/mo
              </Card.Text>
              <Badge className="bg-primary rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(
                  Number(
                    formatEther(memberFlowRate * BigInt(SECONDS_IN_MONTH)),
                  ),
                )}
              </Badge>
            </Stack>
            <Stack direction="vertical" gap={1} className="w-33">
              <Card.Text className="m-0 pe-0 text-nowrap text-center">
                Total
              </Card.Text>
              <Badge className="bg-info rounded-3 py-3 text-start fs-lg fw-semi-bold text-center">
                {formatNumber(Number(formatEther(totalFundingReceived)))}
              </Badge>
            </Stack>
          </Stack>
          <div style={{ maxWidth: 500 }} className="mt-2">
            <Markdown className="p-2">
              {(details.description ?? "").replaceAll("•", "-")}
            </Markdown>
          </div>
          {canAddToBallot &&
            !newBallot?.votes.some((a) => a.recipient === granteeAddress) && (
              <Button
                className="d-flex gap-2 justify-content-center align-items-center px-10 py-4 rounded-4 fw-semi-bold"
                onClick={() =>
                  dispatchNewBallot({
                    type: "add",
                    vote: {
                      recipient: granteeAddress,
                      amount: 1,
                    },
                  })
                }
              >
                <Image
                  src="/add.svg"
                  alt=""
                  width={24}
                  height={24}
                  style={{
                    filter:
                      "invert(100%) sepia(0%) saturate(7497%) hue-rotate(175deg) brightness(103%) contrast(103%)",
                  }}
                />
                Add to Ballot
              </Button>
            )}
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
