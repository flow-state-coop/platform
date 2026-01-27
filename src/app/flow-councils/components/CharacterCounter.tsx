"use client";

type CharacterCounterProps = {
  value: string;
  min?: number;
  max: number;
};

export default function CharacterCounter(props: CharacterCounterProps) {
  const { value, min, max } = props;
  const count = value.length;

  const isTooFew = min !== undefined && count > 0 && count < min;
  const isTooMany = count > max;
  const isError = isTooFew || isTooMany;

  // Determine what to display
  let displayText: string;
  if (count === 0 && min !== undefined) {
    // Starting state with minimum
    displayText = `${count}/${max} characters (${min} min.)`;
  } else if (isTooFew) {
    // Below minimum
    displayText = `${count}/${min} min. characters`;
  } else {
    // Valid or above maximum
    displayText = `${count}/${max} characters`;
  }

  return (
    <div
      className={`d-flex justify-content-end mt-1 small ${isError ? "text-danger" : "text-muted"}`}
    >
      <span
        className="px-2 py-1 rounded"
        style={{
          border: `1px solid ${isError ? "#dc3545" : "#6c757d"}`,
          fontSize: "0.8rem",
        }}
      >
        {displayText}
      </span>
    </div>
  );
}
