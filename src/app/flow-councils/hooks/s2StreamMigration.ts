import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, gql } from "@apollo/client";
import { useAccount } from "wagmi";
import { Framework, SuperToken, Operation } from "@superfluid-finance/sdk-core";
import { getApolloClient } from "@/lib/apollo";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { networks } from "@/lib/networks";
import {
  GOODBUILDERS_COUNCIL_ADDRESSES,
  GOODBUILDERS_S2_POOL_ADDRESS,
  GOODBUILDERS_S2_FEE_ADDRESS,
} from "@/app/flow-councils/lib/constants";

const S2_STREAMS_QUERY = gql`
  query S2StreamsQuery(
    $userAddress: String!
    $token: String!
    $s2Pool: String!
  ) {
    account(id: $userAddress) {
      outflows(where: { token: $token }) {
        receiver {
          id
        }
        currentFlowRate
      }
    }
    pool(id: $s2Pool) {
      poolDistributors(where: { account: $userAddress }) {
        flowRate
      }
    }
  }
`;

type Outflow = {
  receiver: { id: string };
  currentFlowRate: string;
};

export default function useS2StreamMigration(
  chainId: number,
  councilId: string,
  superappSplitterAddress: string | null,
  tokenAddress: string,
) {
  const { address } = useAccount();
  const network = networks.find((n) => n.id === chainId) ?? networks[0];
  const ethersProvider = useEthersProvider({ chainId });
  const ethersSigner = useEthersSigner({ chainId });

  const [sfFramework, setSfFramework] = useState<Framework | null>(null);
  const [superToken, setSuperToken] = useState<SuperToken | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const successRef = useRef(false);

  const isS3Council =
    councilId.toLowerCase() === GOODBUILDERS_COUNCIL_ADDRESSES[1].toLowerCase();
  const shouldSkip = chainId !== 42220 || !isS3Council || !address;

  const { data } = useQuery(S2_STREAMS_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      userAddress: address?.toLowerCase(),
      token: tokenAddress.toLowerCase(),
      s2Pool: GOODBUILDERS_S2_POOL_ADDRESS,
    },
    skip: shouldSkip,
    pollInterval: 10000,
  });

  const s2GdaFlowRate = data?.pool?.poolDistributors?.[0]?.flowRate ?? "0";
  const s2CfaOutflow = data?.account?.outflows?.find(
    (o: Outflow) => o.receiver.id === GOODBUILDERS_S2_FEE_ADDRESS,
  );
  const s2CfaFlowRate = s2CfaOutflow?.currentFlowRate ?? "0";
  const existingS3Outflow = data?.account?.outflows?.find(
    (o: Outflow) => o.receiver.id === superappSplitterAddress?.toLowerCase(),
  );
  const existingS3FlowRate = existingS3Outflow?.currentFlowRate ?? "0";

  const combinedS2FlowRate = BigInt(s2GdaFlowRate) + BigInt(s2CfaFlowRate);
  const hasS2Streams =
    !shouldSkip && !successRef.current && combinedS2FlowRate > BigInt(0);

  useEffect(() => {
    (async () => {
      if (
        shouldSkip ||
        !ethersProvider ||
        !tokenAddress ||
        tokenAddress === "0x"
      ) {
        return;
      }

      const framework = await Framework.create({
        chainId,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const loadedToken = await framework.loadSuperToken(tokenAddress);

      setSfFramework(framework);
      setSuperToken(loadedToken);
    })();
  }, [shouldSkip, ethersProvider, tokenAddress, chainId, network]);

  const cancelS2Streams = useCallback(async () => {
    if (!address || !sfFramework || !superToken || !ethersSigner) return;

    setIsCancelling(true);
    setTransactionError("");

    try {
      const operations: Operation[] = [];

      if (BigInt(s2GdaFlowRate) > BigInt(0)) {
        operations.push(
          superToken.distributeFlow({
            from: address,
            pool: GOODBUILDERS_S2_POOL_ADDRESS,
            requestedFlowRate: "0",
          }),
        );
      }

      if (BigInt(s2CfaFlowRate) > BigInt(0)) {
        operations.push(
          superToken.deleteFlow({
            sender: address,
            receiver: GOODBUILDERS_S2_FEE_ADDRESS,
          }),
        );
      }

      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);
      await tx.wait();

      successRef.current = true;
    } catch (err: unknown) {
      const error = err as { code?: string };
      setTransactionError(
        error.code === "ACTION_REJECTED"
          ? "Transaction rejected"
          : "An error occurred executing the transaction",
      );
    }

    setIsCancelling(false);
  }, [
    address,
    sfFramework,
    superToken,
    ethersSigner,
    s2GdaFlowRate,
    s2CfaFlowRate,
  ]);

  const transferToS3 = useCallback(async () => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !ethersSigner ||
      !superappSplitterAddress
    )
      return;

    setIsTransferring(true);
    setTransactionError("");

    try {
      const operations: Operation[] = [];

      if (BigInt(s2GdaFlowRate) > BigInt(0)) {
        operations.push(
          superToken.distributeFlow({
            from: address,
            pool: GOODBUILDERS_S2_POOL_ADDRESS,
            requestedFlowRate: "0",
          }),
        );
      }

      if (BigInt(s2CfaFlowRate) > BigInt(0)) {
        operations.push(
          superToken.deleteFlow({
            sender: address,
            receiver: GOODBUILDERS_S2_FEE_ADDRESS,
          }),
        );
      }

      const newS3Rate = (
        BigInt(s2GdaFlowRate) +
        BigInt(s2CfaFlowRate) +
        BigInt(existingS3FlowRate)
      ).toString();

      if (BigInt(existingS3FlowRate) > BigInt(0)) {
        operations.push(
          superToken.updateFlow({
            sender: address,
            receiver: superappSplitterAddress,
            flowRate: newS3Rate,
          }),
        );
      } else {
        operations.push(
          superToken.createFlow({
            sender: address,
            receiver: superappSplitterAddress,
            flowRate: newS3Rate,
          }),
        );
      }

      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);
      await tx.wait();

      successRef.current = true;
    } catch (err: unknown) {
      const error = err as { code?: string };
      setTransactionError(
        error.code === "ACTION_REJECTED"
          ? "Transaction rejected"
          : "An error occurred executing the transaction",
      );
    }

    setIsTransferring(false);
  }, [
    address,
    sfFramework,
    superToken,
    ethersSigner,
    superappSplitterAddress,
    s2GdaFlowRate,
    s2CfaFlowRate,
    existingS3FlowRate,
  ]);

  return {
    hasS2Streams,
    combinedS2FlowRate,
    isCancelling,
    isTransferring,
    transactionError,
    cancelS2Streams,
    transferToS3,
  };
}
