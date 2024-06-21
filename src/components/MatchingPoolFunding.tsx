import Offcanvas from "react-bootstrap/Offcanvas";
import { MatchingPool } from "@/types/matchingPool";
import MatchingPoolDetails from "@/components/MatchingPoolDetails";
import { useMediaQuery } from "@/hooks/mediaQuery";

type MatchingPoolFundingProps = {
  show: boolean;
  handleClose: () => void;
  name: string;
  description: string;
  matchingPool: MatchingPool;
};

export default function MatchingPoolFunding(props: MatchingPoolFundingProps) {
  const { show, handleClose, matchingPool, name, description } = props;

  const { isMobile } = useMediaQuery();

  return (
    <Offcanvas
      show={show}
      onHide={handleClose}
      placement={isMobile ? "bottom" : "end"}
      className={`${isMobile ? "w-100 h-100" : ""}`}
    >
      <Offcanvas.Header closeButton>
        <Offcanvas.Title className="fs-4">Fund Matching Pool</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <MatchingPoolDetails
          matchingPool={matchingPool}
          name={name}
          description={description}
        />
      </Offcanvas.Body>
    </Offcanvas>
  );
}
