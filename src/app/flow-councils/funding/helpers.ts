export function isPositiveDecimal(s: string): boolean {
  return /^\d+(\.\d*)?$|^\d*\.\d+$/.test(s);
}

export function sanitizeTxError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (
      code === "ACTION_REJECTED" ||
      code === 4001 ||
      (err as { name?: unknown }).name === "UserRejectedRequestError"
    ) {
      return "Transaction rejected";
    }
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") {
      if (msg.includes("AccessControl")) {
        return "Not authorized: missing role on the splitter contract";
      }
      if (msg.toLowerCase().includes("user rejected")) {
        return "Transaction rejected";
      }
    }
  }
  return "Transaction failed";
}
