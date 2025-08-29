import { useCallback } from "react";
import { useConnect } from "wagmi";
import Button from "react-bootstrap/Button";

export default function CreateCoinbaseWallet() {
  const { connectors, connect } = useConnect();

  const createWallet = useCallback(() => {
    const coinbaseWalletConnector = connectors.find(
      (connector) => connector.id === "coinbaseWalletSDK",
    );

    if (coinbaseWalletConnector) {
      connect({ connector: coinbaseWalletConnector });
    }
  }, [connectors, connect]);

  return (
    <Button
      variant="outline-dark"
      className="border-4 rounded-4 p-4 fs-lg fw-semi-bold"
      style={{ boxSizing: "border-box" }}
      onClick={createWallet}
    >
      Need a wallet?
    </Button>
  );
}
