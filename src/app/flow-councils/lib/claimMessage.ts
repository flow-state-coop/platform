// The message a voter signs to prove they control the wallet before it is added
// as a council voter. It is not a sign-in and creates no session: signing it
// grants nothing by itself, it only proves consent to the claim.
//
// Client and server build this from the same function, so anything the two
// sides spell differently must be normalized here. wagmi hands back a
// checksummed address while the server carries a lowercased one, and Date.now()
// carries milliseconds the server never sees, so both are flattened before the
// text is assembled. Any divergence fails every signature.
export function buildClaimMessage({
  chainId,
  councilId,
  address,
  issuedAt,
}: {
  chainId: number;
  councilId: string;
  address: string;
  issuedAt: number;
}): string {
  const issuedAtSecond = Math.floor(issuedAt / 1000) * 1000;
  const timestamp = new Date(issuedAtSecond)
    .toISOString()
    .replace(/\.\d+Z$/, "Z");

  return [
    "Claim voting rights in this Flow Council.",
    "",
    `Council: ${councilId.toLowerCase()}`,
    `Chain: ${chainId}`,
    `Wallet: ${address.toLowerCase()}`,
    `Issued at: ${timestamp}`,
  ].join("\n");
}
