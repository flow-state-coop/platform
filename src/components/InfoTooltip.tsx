import { useState } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";

export type InfoTooltipProps = {
  content: React.JSX.Element;
  target: React.JSX.Element;
  position?: { top?: boolean; bottom?: boolean; right?: boolean };
  tooltipStyle?: React.CSSProperties;
};

function InfoTooltip(props: InfoTooltipProps) {
  const { content, target, position, tooltipStyle } = props;

  const [showTooltip, setShowTooltip] = useState(false);

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setShowTooltip(false);
  const handleTouchEnd = () => {
    setShowTooltip(true);
    document.addEventListener("touchstart", () => setShowTooltip(false), {
      once: true,
    });
  };

  return (
    <OverlayTrigger
      trigger={["hover", "focus"]}
      show={showTooltip}
      placement={
        position?.top
          ? "top"
          : position?.bottom
            ? "bottom"
            : position?.right
              ? "right"
              : "right-end"
      }
      overlay={
        <Tooltip
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={tooltipStyle}
        >
          {content}
        </Tooltip>
      }
    >
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchEnd={handleTouchEnd}
        className="align-self-start"
      >
        {target}
      </span>
    </OverlayTrigger>
  );
}

export default InfoTooltip;
