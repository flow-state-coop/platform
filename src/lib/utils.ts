import { formatEther } from "viem";

export enum TimeInterval {
  DAY = "/day",
  WEEK = "/week",
  MONTH = "/month",
  YEAR = "/year",
}

export const unitOfTime = {
  [TimeInterval.DAY]: "days",
  [TimeInterval.WEEK]: "weeks",
  [TimeInterval.MONTH]: "months",
  [TimeInterval.YEAR]: "years",
};

export function isNumber(value: string) {
  return !isNaN(Number(value)) && !isNaN(parseFloat(value));
}

export function extractTwitterHandle(url: string) {
  if (!url) {
    return null;
  }

  const match = url.match(/^https?:\/\/(www\.)?twitter.com\/@?(?<handle>\w+)/);

  return match?.groups?.handle ? `${match.groups.handle}` : null;
}

export function extractGithubUsername(url: string) {
  if (!url) {
    return null;
  }

  const match = url.match(
    /^https?:\/\/(www\.)?github.com\/(?<username>[A-Za-z0-9_-]{1,39})/,
  );

  return match?.groups?.username ? `${match.groups.username}` : null;
}

export function roundWeiAmount(amount: bigint, digits: number) {
  return parseFloat(Number(formatEther(amount)).toFixed(digits)).toString();
}

/*
 * Division of ints only square root
 * https://en.wikipedia.org/wiki/Integer_square_root#Using_only_integer_division
 */
export function sqrtBigInt(s: bigint) {
  if (s <= BigInt(1)) {
    return s;
  }

  let x0 = s / BigInt(2);
  let x1 = (x0 + s / x0) / BigInt(2);

  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + s / x0) / BigInt(2);
  }

  return x0;
}

export function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

export function formatNumberWithCommas(n: number) {
  const parts = (n < 0 ? -n : n).toString().split(".");
  const whole = parts[0];
  const fractional = parts[1];
  let i = whole.length;
  let result = "";

  while (i--) {
    result = `${i === 0 ? "" : (whole.length - i) % 3 ? "" : ","}${whole.charAt(
      i,
    )}${result}`;
  }

  return `${n < 0 ? "-" : ""}${result}${fractional ? "." : ""}${
    fractional ?? ""
  }`;
}

export function fromTimeUnitsToSeconds(units: number, type: string) {
  let result = units;

  switch (type) {
    case "minutes":
      result = units * 60;
      break;
    case "hours":
      result = units * 3600;
      break;
    case "days":
      result = units * 86400;
      break;
    case "weeks":
      result = units * 604800;
      break;
    case "months":
      result = units * 2628000;
      break;
    case "years":
      result = units * 31536000;
      break;
    default:
      break;
  }

  return result;
}

export function convertStreamValueToInterval(
  amount: bigint,
  from: TimeInterval,
  to: TimeInterval,
) {
  return roundWeiAmount(
    (amount / BigInt(fromTimeUnitsToSeconds(1, unitOfTime[from]))) *
      BigInt(fromTimeUnitsToSeconds(1, unitOfTime[to])),
    4,
  );
}

export function truncateStr(str: string, strLen: number) {
  if (str.length <= strLen) {
    return str;
  }

  const separator = "...";

  const sepLen = separator.length,
    charsToShow = strLen - sepLen,
    frontChars = Math.ceil(charsToShow / 2),
    backChars = Math.floor(charsToShow / 2);

  return (
    str.substr(0, frontChars) + separator + str.substr(str.length - backChars)
  );
}

export function getPlaceholderImageSrc() {
  return `/placeholders/${Math.floor(Math.random() * 6)}.jpg`;
}
