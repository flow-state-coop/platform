import type { Page } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

// Bridges window.ethereum sign requests from the injected mock provider
// (see mockEthereum.ts) to a real viem signer running in Node. The browser
// calls window.__nodeSign(method, params) and gets back a hex signature.
export async function attachSiweSignBridge(
  page: Page,
  privateKey: `0x${string}`,
): Promise<void> {
  const account = privateKeyToAccount(privateKey);

  await page.exposeFunction(
    "__nodeSign",
    async (method: string, params: unknown[]): Promise<Hex> => {
      if (method === "personal_sign" || method === "eth_sign") {
        // EIP-1193 convention: personal_sign is [data, address]; eth_sign is
        // [address, data]. wagmi uses personal_sign. Handle both for safety.
        let raw = params[0] as string;
        if (method === "eth_sign") raw = params[1] as string;

        const decoded =
          typeof raw === "string" && raw.startsWith("0x")
            ? Buffer.from(raw.slice(2), "hex").toString("utf-8")
            : String(raw);

        // Refuse to sign anything that doesn't look like a SIWE message.
        // The bridge is wired to a deterministic test wallet that may, in the
        // future, hold real testnet funds — do not let an arbitrary in-page
        // script prompt signatures over attacker-chosen payloads.
        if (!/Sign in with Ethereum/i.test(decoded)) {
          throw new Error(
            "siwe bridge: refusing to sign non-SIWE message payload",
          );
        }

        const messageArg =
          typeof raw === "string" && raw.startsWith("0x")
            ? { raw: raw as Hex }
            : decoded;
        return account.signMessage({ message: messageArg });
      }

      if (
        method === "eth_signTypedData_v4" ||
        method === "eth_signTypedData"
      ) {
        // No Phase 4 test flow needs typed-data signatures — SIWE uses
        // personal_sign. Refuse to sign rather than expose a second path that
        // could authorize arbitrary typed payloads with the test key.
        throw new Error(
          "siwe bridge: eth_signTypedData is not supported in E2E tests",
        );
      }

      throw new Error(`siwe bridge: unsupported method ${method}`);
    },
  );
}
