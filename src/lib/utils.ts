import { formatEther } from "viem";

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
