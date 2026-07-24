import { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
import Stack from "react-bootstrap/Stack";
import useFlowCouncil from "../hooks/flowCouncil";
import EligibilityButton from "./EligibilityButton";
import NftEligibilityModal, {
  type NftRequirementGroup,
} from "./NftEligibilityModal";

type PublicGroup = {
  groupId: number;
  name: string;
  eligibilityMethod: string;
  defaultVotingPower: number;
  nftAcquisitionUrl?: string | null;
};

/**
 * Chooses between the NFT eligibility popup and the existing button. Councils
 * without an NFT group fall through to EligibilityButton untouched, which
 * re-runs its own GoodDollar gate, so GoodDollar, manual and metrics councils
 * behave exactly as before. The duplicated public-route fetch on those councils
 * is the deliberate price of leaving that component with a zero-line diff.
 */
export default function VoterEligibility({
  chainId,
  councilId,
  isMobile,
}: {
  chainId: number;
  councilId: string;
  isMobile: boolean;
}) {
  const { councilMember, dispatchShowBallot } = useFlowCouncil();
  const [nftRequirements, setNftRequirements] = useState<
    NftRequirementGroup[] | null
  >(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/voter-groups/public?chainId=${chainId}&councilId=${councilId}&includeMembers=0`,
        );
        const data = await res.json();

        if (cancelled) {
          return;
        }

        if (!Array.isArray(data.groups)) {
          setLookupFailed(true);
          return;
        }

        setLookupFailed(false);
        setNftRequirements(
          data.groups
            .filter((group: PublicGroup) => group.eligibilityMethod === "nft")
            .map((group: PublicGroup) => ({
              groupId: group.groupId,
              name: group.name,
              defaultVotingPower: group.defaultVotingPower,
              nftAcquisitionUrl: group.nftAcquisitionUrl,
            })),
        );
      } catch {
        if (!cancelled) {
          setLookupFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, councilId, lookupAttempt]);

  if (councilMember && nftRequirements && nftRequirements.length > 0) {
    return (
      <>
        <Stack
          direction="vertical"
          gap={2}
          className="align-items-center flex-grow-0"
          style={{ width: isMobile ? "100%" : 240 }}
        >
          <Button
            variant="primary"
            className="w-100 py-4 text-light rounded-4 fs-lg fw-semi-bold"
            onClick={() => dispatchShowBallot({ type: "show" })}
          >
            View Ballot
          </Button>
          <Button
            variant="link"
            className="p-0 text-decoration-underline fw-semi-bold text-primary"
            onClick={() => setShowModal(true)}
          >
            Recheck Eligibility
          </Button>
        </Stack>
        <NftEligibilityModal
          show={showModal}
          onHide={() => setShowModal(false)}
          chainId={chainId}
          councilId={councilId}
          requirements={nftRequirements}
        />
      </>
    );
  }

  // A failed lookup can't tell an NFT council from any other, so retrying is the
  // only action that can recover the right control. An existing voter needs no
  // lookup: EligibilityButton below shows them their ballot either way.
  if (lookupFailed && !nftRequirements && !councilMember) {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        onClick={() => setLookupAttempt((attempt) => attempt + 1)}
      >
        Retry Eligibility Check
      </Button>
    );
  }

  if (!nftRequirements || nftRequirements.length === 0) {
    return (
      <EligibilityButton
        chainId={chainId}
        councilId={councilId}
        isMobile={isMobile}
      />
    );
  }

  return (
    <>
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        onClick={() => setShowModal(true)}
      >
        Check Voter Eligibility
      </Button>
      <NftEligibilityModal
        show={showModal}
        onHide={() => setShowModal(false)}
        chainId={chainId}
        councilId={councilId}
        requirements={nftRequirements}
      />
    </>
  );
}
