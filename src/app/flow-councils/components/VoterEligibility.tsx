import { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
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
  const [nftRequirements, setNftRequirements] = useState<
    NftRequirementGroup[] | null
  >(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/voter-groups/public?chainId=${chainId}&councilId=${councilId}`,
        );
        const data = await res.json();

        if (cancelled || !Array.isArray(data.groups)) {
          return;
        }

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
        // Leave the NFT branch unselected on a failed lookup, which falls
        // through to the existing button.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, councilId]);

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
