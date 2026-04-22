import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";

export const TEST_PRIVATE_KEY = (process.env.TEST_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

export const TEST_CHAIN_ID = 11155420;

export function getTestAccount() {
  return privateKeyToAccount(TEST_PRIVATE_KEY);
}

// Returns a string of browser-side JS to be passed to page.addInitScript.
// The script installs an EIP-1193 provider at window.ethereum that answers
// read methods synchronously and bridges signing methods back to Node via
// window.__nodeSign (registered by attachSiweSignBridge).
export function buildMockEthereumScript(privateKey: `0x${string}`): string {
  const account = privateKeyToAccount(privateKey);
  const address = account.address;
  const chainIdHex = toHex(TEST_CHAIN_ID);

  return `
    (function() {
      const address = "${address}";
      const chainIdHex = "${chainIdHex}";
      const listeners = {};

      function emit(event, payload) {
        const handlers = listeners[event] || [];
        for (const h of handlers) {
          try { h(payload); } catch (_) {}
        }
      }

      const provider = {
        isMetaMask: true,
        isInjected: true,
        selectedAddress: address,
        chainId: chainIdHex,
        networkVersion: String(parseInt(chainIdHex, 16)),
        request: async function(args) {
          const method = args && args.method;
          const params = (args && args.params) || [];
          switch (method) {
            case "eth_chainId":
              return chainIdHex;
            case "eth_accounts":
            case "eth_requestAccounts":
              return [address];
            case "net_version":
              return String(parseInt(chainIdHex, 16));
            case "eth_blockNumber":
              return "0x1";
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "personal_sign":
            case "eth_sign":
            case "eth_signTypedData_v4":
            case "eth_signTypedData": {
              if (typeof window.__nodeSign !== "function") {
                throw new Error("mock signer not attached: call attachSiweSignBridge(page) before navigation");
              }
              return await window.__nodeSign(method, params);
            }
            default:
              return null;
          }
        },
        on: function(event, handler) {
          listeners[event] = listeners[event] || [];
          listeners[event].push(handler);
        },
        removeListener: function(event, handler) {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter(function(h) { return h !== handler; });
        },
        emit,
      };

      Object.defineProperty(window, "ethereum", {
        value: provider,
        writable: false,
        configurable: false,
      });
    })();
  `;
}
