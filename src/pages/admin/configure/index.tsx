import { useState, useEffect } from "react";
import {
  Address,
  encodeAbiParameters,
  parseAbiParameters,
  parseEther,
  parseEventLogs,
} from "viem";
import { useAccount, useReadContract, usePublicClient, useConfig } from "wagmi";
import {
  writeContract,
  getWalletClient,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import useAdminParams from "@/hooks/adminParams";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { isNumber } from "@/lib/utils";
import { strategyBytecode } from "@/lib/strategyBytecode";
import { erc721CheckerBytecode } from "@/lib/erc721CheckerBytecode";
import { strategyAbi } from "@/lib/abi/strategy";
import { alloAbi } from "@/lib/abi/allo";
import { erc721Abi } from "@/lib/abi/erc721";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { pinJsonToIpfs } from "@/lib/ipfs";
import { ZERO_ADDRESS } from "@/lib/constants";

const POOL_BY_ID_QUERY = gql`
  query PoolByIdQuery($poolId: String, $chainId: Int) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        id: { equalTo: $poolId }
        tags: { contains: "allo" }
      }
    ) {
      strategyAddress
      metadata
    }
  }
`;

type PoolConfigParameters = {
  allocationToken: string;
  matchingToken: string;
  minPassportScore: string;
  name: string;
  description: string;
  nftAddress: string;
  nftMintUrl: string;
};

enum EligibilityMethod {
  PASSPORT = "Gitcoin Passport",
  NFT_GATING = "NFT Gated",
}

export default function Configure() {
  const [transactionsCompleted, setTransactionsCompleted] = useState(0);
  const [areTransactionsLoading, setAreTransactionsLoading] = useState(false);
  const [poolConfigParameters, setPoolConfigParameters] =
    useState<PoolConfigParameters>({
      allocationToken: "DAIx",
      matchingToken: "ETHx",
      minPassportScore: "",
      name: "",
      description: "",
      nftAddress: "",
      nftMintUrl: "",
    });
  const [eligibilityMethod, setEligibilityMethod] = useState(
    EligibilityMethod.PASSPORT,
  );

  const { chain: connectedChain } = useAccount();
  const {
    profileId,
    profileOwner,
    profileMembers,
    poolId,
    chainId,
    updatePoolId,
  } = useAdminParams();
  const { data: queryRes, loading } = useQuery(POOL_BY_ID_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      poolId,
      chainId,
    },
    skip: !poolId,
    pollInterval: 3000,
  });
  const { data: nftName } = useReadContract({
    address: (poolConfigParameters.nftAddress as Address) ?? "0x",
    abi: erc721Abi,
    functionName: "name",
    query: { enabled: !!poolConfigParameters.nftAddress },
  });
  const { isMobile } = useMediaQuery();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();

  const network = networks.filter((network) => network.id === chainId)[0];
  const pool = queryRes?.pools[0] ?? null;
  const totalTransactions =
    eligibilityMethod === EligibilityMethod.PASSPORT ? 2 : 3;

  useEffect(() => {
    (async () => {
      if (!pool || !publicClient || !network) {
        return;
      }

      const minPassportScore = await publicClient.readContract({
        address: pool.strategyAddress as Address,
        abi: strategyAbi,
        functionName: "minPassportScore",
      });
      const allocationSuperToken = await publicClient.readContract({
        address: pool.strategyAddress as Address,
        abi: strategyAbi,
        functionName: "allocationSuperToken",
      });
      const poolSuperToken = await publicClient.readContract({
        address: pool.strategyAddress as Address,
        abi: strategyAbi,
        functionName: "poolSuperToken",
      });

      const allocationToken =
        network.tokens.filter(
          (token) => allocationSuperToken === token.address,
        )[0].name ?? "N/A";
      const matchingToken =
        network.tokens.filter((token) => poolSuperToken === token.address)[0]
          .name ?? "N/A";

      let nftAddress = "";

      try {
        const checker = await publicClient.readContract({
          address: pool.strategyAddress as Address,
          abi: strategyAbi,
          functionName: "checker",
        });

        if (checker !== ZERO_ADDRESS) {
          nftAddress =
            ((await publicClient.readContract({
              address: checker,
              abi: erc721CheckerAbi,
              functionName: "erc721",
            })) as Address) ?? "";

          setEligibilityMethod(EligibilityMethod.NFT_GATING);
        }
      } catch (err) {
        console.error(err);
      }

      setPoolConfigParameters({
        allocationToken,
        matchingToken,
        minPassportScore: (Number(minPassportScore) / 10000).toString(),
        name: pool.metadata.name,
        description: pool.metadata.description ?? "",
        nftAddress,
        nftMintUrl: pool.metadata.nftMintUrl ?? "",
      });
    })();
  }, [pool, publicClient, network]);

  const handleCreatePool = async () => {
    if (!network) {
      throw Error("Wrong Network");
    }

    if (!profileId) {
      throw Error("Profile not found");
    }

    setAreTransactionsLoading(true);

    const { IpfsHash: metadataCid } = await pinJsonToIpfs({
      name: poolConfigParameters.name,
      description: poolConfigParameters.description,
      nftMintUrl: poolConfigParameters.nftMintUrl,
    });
    const allocationSuperToken = network.tokens.find(
      (token) => token.name === poolConfigParameters.allocationToken,
    )?.address;

    if (!allocationSuperToken) {
      throw Error("Allocation token not found");
    }

    const poolSuperToken = network.tokens.find(
      (token) => token.name === poolConfigParameters.matchingToken,
    )?.address;

    if (!poolSuperToken) {
      throw Error("Matching token not found");
    }

    let nftCheckerAddress;

    if (
      eligibilityMethod === EligibilityMethod.NFT_GATING &&
      poolConfigParameters.nftAddress
    ) {
      nftCheckerAddress = await deployNftChecker();

      setTransactionsCompleted(1);

      if (!nftCheckerAddress) {
        throw Error("Failed to deploy NFT Checker");
      }
    }

    const now = (Date.now() / 1000) | 0;
    const initParams = {
      useRegistryAnchor: true,
      metadataRequired: true,
      passportDecoder: network.passportDecoder,
      superfluidHost: network.superfluidHost,
      allocationSuperToken,
      recipientSuperAppFactory: network.recipientSuperappFactory,
      registrationStartTime: BigInt(now + 300),
      registrationEndTime: BigInt(now + 3153600000),
      allocationStartTime: BigInt(now + 300),
      allocationEndTime: BigInt(now + 3153600000),
      minPassportScore:
        !poolConfigParameters.minPassportScore ||
        isNaN(Number(poolConfigParameters.minPassportScore))
          ? BigInt(0)
          : BigInt(Number(poolConfigParameters.minPassportScore) * 10000),
      initialSuperAppBalance: parseEther("0.0000001"),
      checker:
        eligibilityMethod === EligibilityMethod.NFT_GATING && nftCheckerAddress
          ? (nftCheckerAddress as Address)
          : ZERO_ADDRESS,
    };
    const metadata = { protocol: BigInt(1), pointer: metadataCid };
    const initData: `0x${string}` = encodeAbiParameters(
      parseAbiParameters(
        "bool, bool, address, address, address, address, uint64, uint64, uint64, uint64, uint256, uint256, address",
      ),
      [
        initParams.useRegistryAnchor,
        initParams.metadataRequired,
        initParams.passportDecoder,
        initParams.superfluidHost,
        initParams.allocationSuperToken,
        initParams.recipientSuperAppFactory,
        initParams.registrationStartTime,
        initParams.registrationEndTime,
        initParams.allocationStartTime,
        initParams.allocationEndTime,
        initParams.minPassportScore,
        initParams.initialSuperAppBalance,
        initParams.checker,
      ],
    );

    try {
      const strategyAddress = await deployStrategy();

      setTransactionsCompleted((prev) => prev + 1);

      if (!strategyAddress) {
        throw Error("Failed to deploy strategy");
      }

      const hash = await writeContract(wagmiConfig, {
        address: network.allo,
        abi: alloAbi,
        functionName: "createPoolWithCustomStrategy",
        args: [
          profileId as `0x${string}`,
          strategyAddress,
          initData,
          poolSuperToken,
          BigInt(0),
          metadata,
          profileMembers as `0x${string}`[],
        ],
      });

      const txReceipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: network?.id,
        hash,
      });
      const topics = parseEventLogs({
        abi: alloAbi,
        eventName: "PoolCreated",
        logs: txReceipt.logs,
      });

      updatePoolId(topics[0].args.poolId.toString());

      setTransactionsCompleted(0);
      setAreTransactionsLoading(false);
    } catch (err) {
      setTransactionsCompleted(0);
      setAreTransactionsLoading(false);

      console.error(err);
    }
  };

  const deployStrategy = async () => {
    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: network?.id,
      });
      const deploymentTxHash = await walletClient.deployContract({
        abi: strategyAbi,
        bytecode: strategyBytecode,
        args: [network.allo, "SQFSuperfluidv1"],
      });
      const deploymentTx = await waitForTransactionReceipt(wagmiConfig, {
        chainId: network?.id,
        hash: deploymentTxHash,
        confirmations: 3,
      });

      return deploymentTx.contractAddress;
    } catch (err) {
      console.error(err);
    }
  };

  const deployNftChecker = async () => {
    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: network?.id,
      });
      const deploymentTxHash = await walletClient.deployContract({
        abi: erc721CheckerAbi,
        bytecode: erc721CheckerBytecode,
        args: [poolConfigParameters.nftAddress],
      });
      const deploymentTx = await waitForTransactionReceipt(wagmiConfig, {
        chainId: network?.id,
        hash: deploymentTxHash,
        confirmations: 3,
      });

      return deploymentTx.contractAddress;
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      {loading || (poolId && !pool) ? (
        <Spinner className="m-auto" />
      ) : !profileId || !profileOwner ? (
        <>Program not found, please select one from Program Selection</>
      ) : connectedChain?.id !== network.id ? (
        <>Wrong network</>
      ) : (
        <Form
          className="d-flex flex-column gap-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <Form.Group style={{ width: isMobile ? "100%" : "20%" }}>
            <Form.Label>Pool Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="SQF"
              disabled={!!pool}
              onChange={(e) =>
                setPoolConfigParameters({
                  ...poolConfigParameters,
                  name: e.target.value,
                })
              }
              value={poolConfigParameters.name}
            />
          </Form.Group>
          <Form.Group style={{ width: isMobile ? "100%" : "50%" }}>
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              style={{ resize: "none" }}
              disabled={!!pool}
              onChange={(e) =>
                setPoolConfigParameters({
                  ...poolConfigParameters,
                  description: e.target.value,
                })
              }
              value={poolConfigParameters.description}
            />
          </Form.Group>
          <Dropdown>
            <Form.Label className="px-1">Donation Token</Form.Label>
            <Dropdown.Toggle
              variant="transparent"
              className="d-flex justify-content-between align-items-center border border-2"
              style={{ width: isMobile ? "50%" : "20%" }}
              disabled={!network || !!pool || !publicClient}
            >
              {poolConfigParameters.allocationToken}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {network &&
                network.tokens.map((token, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      setPoolConfigParameters({
                        ...poolConfigParameters,
                        allocationToken: token.name ?? "N/A",
                      });
                    }}
                  >
                    {token.name}
                  </Dropdown.Item>
                ))}
            </Dropdown.Menu>
          </Dropdown>
          <Dropdown>
            <Form.Label className="px-1">Matching Token</Form.Label>
            <Dropdown.Toggle
              variant="transparent"
              className="d-flex justify-content-between align-items-center border border-2"
              style={{ width: isMobile ? "50%" : "20%" }}
              disabled={!network || !!pool || !publicClient}
            >
              {poolConfigParameters.matchingToken}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {network &&
                network.tokens.map((token, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      setPoolConfigParameters({
                        ...poolConfigParameters,
                        matchingToken: token.name ?? "N/A",
                      });
                    }}
                  >
                    {token.name}
                  </Dropdown.Item>
                ))}
            </Dropdown.Menu>
          </Dropdown>
          <Dropdown>
            <Form.Label className="px-1">Voter Eligibility</Form.Label>
            <Dropdown.Toggle
              disabled={!network || !!pool || !publicClient}
              variant="transparent"
              className="d-flex justify-content-between align-items-center border border-2"
              style={{ width: isMobile ? "50%" : "20%" }}
            >
              {eligibilityMethod}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item
                onClick={() => setEligibilityMethod(EligibilityMethod.PASSPORT)}
              >
                {EligibilityMethod.PASSPORT}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() =>
                  setEligibilityMethod(EligibilityMethod.NFT_GATING)
                }
              >
                {EligibilityMethod.NFT_GATING}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          {eligibilityMethod === EligibilityMethod.PASSPORT ? (
            <Form.Group style={{ width: isMobile ? "50%" : "20%" }}>
              <Form.Label>Required Passport Score</Form.Label>
              <Form.Control
                type="text"
                disabled={!!pool}
                placeholder="1"
                onChange={(e) => {
                  if (
                    isNumber(e.target.value) ||
                    e.target.value === "." ||
                    e.target.value === ""
                  ) {
                    setPoolConfigParameters({
                      ...poolConfigParameters,
                      minPassportScore: e.target.value,
                    });
                  }
                }}
                value={poolConfigParameters.minPassportScore}
              />
            </Form.Group>
          ) : (
            <>
              <Stack direction={isMobile ? "vertical" : "horizontal"} gap={4}>
                <Form.Group style={{ width: isMobile ? "auto" : 440 }}>
                  <Form.Label>NFT Contract Address</Form.Label>
                  <Form.Control
                    type="text"
                    disabled={!!pool}
                    onChange={(e) =>
                      setPoolConfigParameters({
                        ...poolConfigParameters,
                        nftAddress: e.target.value,
                      })
                    }
                    value={poolConfigParameters.nftAddress}
                  />
                </Form.Group>
                <Form.Group className="w100 flexshrink-1">
                  <Form.Label>NFT Name</Form.Label>
                  <Form.Control type="text" disabled value={nftName ?? ""} />
                </Form.Group>
              </Stack>
              {(!pool || poolConfigParameters.nftMintUrl) && (
                <Form.Group style={{ width: isMobile ? "100%" : "50%" }}>
                  <Form.Label>Mint URL or Contact (Optional)</Form.Label>
                  <Form.Control
                    type="text"
                    disabled={!!pool}
                    onChange={(e) =>
                      setPoolConfigParameters({
                        ...poolConfigParameters,
                        nftMintUrl: e.target.value,
                      })
                    }
                    value={poolConfigParameters.nftMintUrl}
                  />
                </Form.Group>
              )}
            </>
          )}
          <Button
            className="d-flex gap-2 justify-content-center align-items-center w-25 mt-4"
            disabled={
              !!pool ||
              !poolConfigParameters.name ||
              (!poolConfigParameters.minPassportScore &&
                !poolConfigParameters.nftAddress)
            }
            onClick={handleCreatePool}
          >
            {areTransactionsLoading ? (
              <>
                <Spinner size="sm" />
                {transactionsCompleted + 1}/{totalTransactions}
              </>
            ) : (
              `Launch Pool (${totalTransactions})`
            )}
          </Button>
        </Form>
      )}
    </Stack>
  );
}
