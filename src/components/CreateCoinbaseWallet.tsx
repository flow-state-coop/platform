import { useCallback } from "react";
import { useConnect } from "wagmi";
import Image from "react-bootstrap/Image";
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
      variant="secondary"
      className="d-flex align-items-center gap-2 rounded-3 text-light shadow"
      onClick={createWallet}
    >
      <Image src="/coinbase.svg" alt="Coinbase" width={20} height={20} />
      Create Wallet
    </Button>
  );
}
