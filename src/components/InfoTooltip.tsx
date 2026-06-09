import { useState } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";

export type InfoTooltipProps = {
  content: React.JSX.Element;
  target: React.JSX.Element;
  position?: { top?: boolean; bottom?: boolean; right?: boolean };
  tooltipStyle?: React.CSSProperties;
  wrapperClassName?: string;
};

function InfoTooltip(props: InfoTooltipProps) {
  const {
    content,
    target,
    position,
    tooltipStyle,
    wrapperClassName = "align-self-start",
  } = props;

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
        className={wrapperClassName}
      >
        {target}
      </span>
    </OverlayTrigger>
  );
}

export default InfoTooltip;
