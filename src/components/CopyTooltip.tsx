import { forwardRef, useEffect, useState } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import Button from "react-bootstrap/Button";

type CopyTooltipProps = {
  contentClick: string;
  contentHover: string;
  target: React.JSX.Element;
  handleCopy: () => void | Promise<void>;
};

const UpdatingTooltip = forwardRef(function UpdatingTooltip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { popper, children, showTooltip, ...props }: any,
  ref,
) {
  useEffect(() => {
    popper.scheduleUpdate();
  }, [children, popper]);

  if (!showTooltip) {
    return null;
  }

  return (
    <Tooltip ref={ref} {...props}>
      {children}
    </Tooltip>
  );
});

function CopyTooltip(props: CopyTooltipProps) {
  const { contentClick, contentHover, target, handleCopy } = props;

  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => {
    if (!copied && !failed) {
      setShowTooltip(false);
    }
  };
  const handleClick = async () => {
    if (copied || failed) {
      return;
    }

    // Awaited, and never reported as copied on a rejection: the clipboard
    // write can fail (permissions policy, an unfocused document), and some of
    // what this copies, a freshly minted API key, cannot be recovered once its
    // one-time display is dismissed on the strength of a "Copied" that lied.
    let ok = true;
    try {
      await handleCopy();
    } catch (err) {
      console.error(err);
      ok = false;
    }

    if (ok) {
      setCopied(true);
    } else {
      setFailed(true);
    }

    setTimeout(() => {
      setShowTooltip(false);
      setCopied(false);
      setFailed(false);
    }, 4000);
  };

  return (
    <OverlayTrigger
      show={showTooltip}
      overlay={
        <UpdatingTooltip
          key="top"
          placement="top"
          id="tooltip-key"
          showTooltip={showTooltip}
        >
          {failed ? "Copy failed" : copied ? contentClick : contentHover}
        </UpdatingTooltip>
      }
    >
      <Button
        className="d-flex align-items-center p-0 bg-transparent border-0 shadow-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {target}
      </Button>
    </OverlayTrigger>
  );
}

export default CopyTooltip;
