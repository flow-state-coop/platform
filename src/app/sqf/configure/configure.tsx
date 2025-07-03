"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Address,
  encodeAbiParameters,
  parseAbiParameters,
  parseEther,
  parseEventLogs,
} from "viem";
import {
  useAccount,
  useReadContract,
  usePublicClient,
  useConfig,
  useSwitchChain,
} from "wagmi";
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
import Card from "react-bootstrap/Card";
import Sidebar from "../components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "../lib/networks";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { strategyBytecode } from "@/lib/strategyBytecode";
import { erc721CheckerBytecode } from "@/lib/erc721CheckerBytecode";
import { strategyAbi } from "@/lib/abi/strategy";
import { alloAbi } from "@/lib/abi/allo";
import { erc721Abi } from "@/lib/abi/erc721";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { pinJsonToIpfs } from "@/lib/ipfs";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { ZERO_ADDRESS } from "@/lib/constants";

type ConfigureProps = {
  chainId: number | null;
  profileId: string | null;
  poolId: string | null;
  showNextButton: boolean;
};

type PoolConfigParameters = {
  allocationToken: string;
  matchingToken: string;
  name: string;
  description: string;
  nftAddress: string;
  nftMintUrl: string;
  flowStateEligibility: boolean;
};

enum EligibilityMethod {
  FLOW_STATE = "Flow State Managed",
  NFT_GATING = "ERC721 NFT Gated",
}

enum NFTInterfaceID {
  ERC721 = "0x80ac58cd",
  ERC1155 = "0xd9b67a26",
}

const POOL_BY_ID_QUERY = gql`
  query PoolByIdQuery($poolId: String, $chainId: Int!, $profileId: String!) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        id: { equalTo: $poolId }
        tags: { contains: "allo" }
      }
    ) {
      strategyAddress
      metadataCid
    }
    profile(chainId: $chainId, id: $profileId) {
      profileRolesByChainIdAndProfileId {
        address
      }
    }
  }
`;

export default function Configure(props: ConfigureProps) {
  const { chainId, profileId, poolId, showNextButton } = props;

  const [pool, setPool] = useState<{
    strategyAddress: string;
    metadata: {
      name: string;
      description: string;
      nftMintUrl: string;
      flowStateEligibility: boolean;
    };
  } | null>(null);
  const [areTransactionsLoading, setAreTransactionsLoading] = useState(false);
  const [transactionsCompleted, setTransactionsCompleted] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [existingStrategyAddress, setExistingStrategyAddress] = useState("");
  const [existingNftChecker, setExistingNftChecker] = useState("");
  const [poolConfigParameters, setPoolConfigParameters] =
    useState<PoolConfigParameters>({
      allocationToken: "N/A",
      matchingToken: "N/A",
      name: "",
      description: "",
      nftAddress: "",
      nftMintUrl: "",
      flowStateEligibility: true,
    });
  const [eligibilityMethod, setEligibilityMethod] = useState(
    EligibilityMethod.FLOW_STATE,
  );

  const router = useRouter();
  const { chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: queryRes, loading } = useQuery(POOL_BY_ID_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      poolId,
      chainId,
      profileId,
    },
    skip: !poolId && !profileId,
    pollInterval: 4000,
  });
  const { data: nftName } = useReadContract({
    address: (poolConfigParameters.nftAddress as Address) ?? "0x",
    abi: erc721Abi,
    functionName: "name",
    query: { enabled: !!poolConfigParameters.nftAddress },
  });
  const { data: isErc721 } = useReadContract({
    address: (poolConfigParameters.nftAddress as Address) ?? "0x",
    abi: erc721Abi,
    functionName: "supportsInterface",
    args: [NFTInterfaceID.ERC721],
    query: { enabled: !!poolConfigParameters.nftAddress },
  });
  const { isMobile } = useMediaQuery();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();

  const network = networks.filter((network) => network.id === chainId)[0];
  const profile = queryRes?.profile ?? null;
  const isNotAllowed =
    !!pool ||
    !poolConfigParameters.name ||
    !poolConfigParameters.nftAddress ||
    (!!poolConfigParameters.nftAddress && (!nftName || !isErc721));

  useEffect(() => {
    if (areTransactionsLoading) {
      return;
    }

    setTotalTransactions(
      existingNftChecker && existingStrategyAddress
        ? 1
        : existingNftChecker || existingStrategyAddress
          ? 2
          : 3,
    );
  }, [
    eligibilityMethod,
    existingStrategyAddress,
    existingNftChecker,
    areTransactionsLoading,
  ]);

  useEffect(() => {
    if (!network) {
      return;
    }

    setPoolConfigParameters((prev) => {
      return {
        ...prev,
        allocationToken: network.tokens[0].symbol,
        matchingToken: network.tokens[0].symbol,
        nftAddress: network.flowStateEligibilityNft,
      };
    });
  }, [network]);

  useEffect(() => {
    (async () => {
      if (!queryRes?.pools) {
        return;
      }

      const pool = queryRes.pools[0] ?? null;
      const metadata = await fetchIpfsJson(pool.metadataCid);

      setPool({ ...pool, metadata });
    })();
  }, [queryRes?.pools]);

  useEffect(() => {
    (async () => {
      if (
        !pool ||
        !publicClient ||
        !network ||
        connectedChain?.id !== network.id
      ) {
        return;
      }

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
          (token) =>
            allocationSuperToken.toLowerCase() === token.address.toLowerCase(),
        )[0].symbol ?? "N/A";
      const matchingToken =
        network.tokens.filter(
          (token) =>
            poolSuperToken.toLowerCase() === token.address.toLowerCase(),
        )[0].symbol ?? "N/A";

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

          setEligibilityMethod(
            pool.metadata.flowStateEligibility
              ? EligibilityMethod.FLOW_STATE
              : EligibilityMethod.NFT_GATING,
          );
        }
      } catch (err) {
        console.error(err);
      }

      setPoolConfigParameters({
        allocationToken,
        matchingToken,
        name: pool.metadata.name,
        description: pool.metadata.description ?? "",
        nftAddress,
        nftMintUrl: pool.metadata.nftMintUrl ?? "",
        flowStateEligibility: pool.metadata.flowStateEligibility,
      });
    })();
  }, [pool, publicClient, network, connectedChain]);

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
      flowStateEligibility: poolConfigParameters.flowStateEligibility,
    });
    const allocationToken = network.tokens.find(
      (token) => token.symbol === poolConfigParameters.allocationToken,
    );

    if (!allocationToken) {
      throw Error("Allocation token not found");
    }

    const poolSuperToken = network.tokens.find(
      (token) => token.symbol === poolConfigParameters.matchingToken,
    )?.address;

    if (!poolSuperToken) {
      throw Error("Matching token not found");
    }

    let nftCheckerAddress;

    if (existingNftChecker) {
      nftCheckerAddress = existingNftChecker;
    } else if (poolConfigParameters.nftAddress && !existingNftChecker) {
      nftCheckerAddress = await deployNftChecker();

      setTransactionsCompleted(transactionsCompleted + 1);

      if (!nftCheckerAddress) {
        return;
      }

      setExistingNftChecker(nftCheckerAddress);
    }

    const now = (Date.now() / 1000) | 0;
    const initParams = {
      useRegistryAnchor: true,
      metadataRequired: true,
      passportDecoder:
        `${ZERO_ADDRESS.slice(0, ZERO_ADDRESS.length - 1)}1` as Address,
      superfluidHost: network.superfluidHost,
      allocationSuperToken: allocationToken.address,
      recipientSuperAppFactory: network.recipientSuperappFactory,
      registrationStartTime: BigInt(
        network.id === 11155420 ? now + 60 : now + 300,
      ),
      registrationEndTime: BigInt(now + 3153600000),
      allocationStartTime: BigInt(
        network.id === 11155420 ? now + 60 : now + 300,
      ),
      allocationEndTime: BigInt(now + 3153600000),
      minPassportScore: BigInt(0),
      initialSuperAppBalance: parseEther("0.0000001"),
      checker: nftCheckerAddress
        ? (nftCheckerAddress as Address)
        : ZERO_ADDRESS,
      flowRateScaling: getPoolFlowRateConfig(allocationToken.symbol)
        .flowRateScaling,
    };
    const metadata = { protocol: BigInt(1), pointer: metadataCid };
    const initData: `0x${string}` = encodeAbiParameters(
      parseAbiParameters(
        "bool, bool, address, address, address, address, uint64, uint64, uint64, uint64, uint256, uint256, address, uint256",
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
        initParams.flowRateScaling,
      ],
    );

    try {
      const strategyAddress = existingStrategyAddress
        ? existingStrategyAddress
        : await deployStrategy();

      if (!existingStrategyAddress) {
        setTransactionsCompleted((prev) => prev + 1);
      }

      if (!strategyAddress) {
        return;
      }

      setExistingStrategyAddress(strategyAddress);

      const profileMembers = Array.from(
        new Set(
          profile.profileRolesByChainIdAndProfileId.map(
            (profile: { address: string }) => profile.address,
          ),
        ),
      );
      const hash = await writeContract(wagmiConfig, {
        address: network.allo,
        abi: alloAbi,
        functionName: "createPoolWithCustomStrategy",
        args: [
          profileId as `0x${string}`,
          strategyAddress as `0x${string}`,
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

      setTransactionsCompleted(0);
      setAreTransactionsLoading(false);

      router.push(
        `/sqf/configure/?chainId=${chainId}&profileId=${profileId}&poolId=${topics[0].args.poolId.toString()}&new=true`,
      );
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
    <>
      <Sidebar />
      <Stack direction="vertical" className={!isMobile ? "w-75" : "w-100"}>
        <Stack direction="vertical" gap={4} className="px-5 py-4 mb-5">
          {loading || (poolId && !pool) ? (
            <Spinner className="m-auto" />
          ) : !profileId || !chainId ? (
            <Card.Text>
              Program not found, please select one from{" "}
              <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : !connectedChain ? (
            <>Please connect a wallet</>
          ) : connectedChain?.id !== network?.id ? (
            <Card.Text>
              Wrong network, please connect to{" "}
              <span
                className="p-0 text-decoration-underline cursor-pointer"
                onClick={() => switchChain({ chainId: network?.id ?? 10 })}
              >
                {network?.name}
              </span>{" "}
              or return to <Link href="/sqf">Program Selection</Link>
            </Card.Text>
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
                  onChange={(e) => {
                    setPoolConfigParameters({
                      ...poolConfigParameters,
                      name: e.target.value,
                    });
                    setExistingStrategyAddress("");
                  }}
                  value={poolConfigParameters.name}
                />
              </Form.Group>
              <Form.Group style={{ width: isMobile ? "100%" : "50%" }}>
                <Form.Label>
                  Description (
                  <Link
                    href="https://www.markdownguide.org/basic-syntax/"
                    target="_blank"
                  >
                    supports basic Markdown syntax
                  </Link>
                  )
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  style={{ resize: "none" }}
                  disabled={!!pool}
                  onChange={(e) => {
                    setPoolConfigParameters({
                      ...poolConfigParameters,
                      description: e.target.value,
                    });
                    setExistingStrategyAddress("");
                  }}
                  value={poolConfigParameters.description}
                />
              </Form.Group>
              <Dropdown>
                <Form.Label className="px-1">
                  Donation Token (
                  <Card.Link href="https://t.me/flowstatecoop/" target="_blank">
                    Request to add a token
                  </Card.Link>
                  )
                </Form.Label>
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
                    network.tokens.map((token, i) => {
                      return (
                        <Dropdown.Item
                          key={i}
                          onClick={() => {
                            setPoolConfigParameters({
                              ...poolConfigParameters,
                              allocationToken: token.symbol ?? "N/A",
                            });
                          }}
                        >
                          {token.symbol}
                        </Dropdown.Item>
                      );
                    })}
                </Dropdown.Menu>
              </Dropdown>
              <Dropdown>
                <Form.Label className="px-1">
                  Matching Token (
                  <Card.Link href="https://t.me/flowstatecoop/" target="_blank">
                    Request to add a token
                  </Card.Link>
                  )
                </Form.Label>
                <Dropdown.Toggle
                  variant="transparent"
                  className="d-flex justify-content-between align-items-center border border-2"
                  style={{ width: isMobile ? "50%" : "20%" }}
                  disabled={!network || !!pool || !publicClient}
                >
                  {poolConfigParameters.matchingToken}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {network
                    ? network.tokens.map((token, i) => (
                        <Dropdown.Item
                          key={i}
                          onClick={() => {
                            setPoolConfigParameters({
                              ...poolConfigParameters,
                              matchingToken: token.symbol ?? "N/A",
                            });
                          }}
                        >
                          {token.symbol}
                        </Dropdown.Item>
                      ))
                    : null}
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
                  {!!network.flowStateEligibilityNft && (
                    <Dropdown.Item
                      onClick={() => {
                        setEligibilityMethod(EligibilityMethod.FLOW_STATE);
                        setPoolConfigParameters({
                          ...poolConfigParameters,
                          nftAddress: network.flowStateEligibilityNft,
                          nftMintUrl: "",
                          flowStateEligibility: true,
                        });
                      }}
                    >
                      {EligibilityMethod.FLOW_STATE}
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item
                    onClick={() => {
                      setEligibilityMethod(EligibilityMethod.NFT_GATING);
                      setPoolConfigParameters({
                        ...poolConfigParameters,
                        flowStateEligibility: false,
                      });
                    }}
                  >
                    {EligibilityMethod.NFT_GATING}
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={4}
                  className="align-items-start"
                >
                  <Form.Group style={{ width: isMobile ? "auto" : 440 }}>
                    <Form.Label>NFT Contract Address</Form.Label>
                    <Form.Control
                      type="text"
                      disabled={
                        !!pool ||
                        eligibilityMethod === EligibilityMethod.FLOW_STATE
                      }
                      onChange={(e) => {
                        setPoolConfigParameters({
                          ...poolConfigParameters,
                          nftAddress: e.target.value,
                        });
                        setExistingStrategyAddress("");
                        setExistingNftChecker("");
                      }}
                      value={poolConfigParameters.nftAddress}
                    />
                    {!!poolConfigParameters.nftAddress && !isErc721 && (
                      <Card.Text className="m-0 mt-1 text-danger">
                        This isn't an ERC721 NFT Contract
                      </Card.Text>
                    )}
                  </Form.Group>
                  <Form.Group className="w100 flexshrink-1">
                    <Form.Label>NFT Name</Form.Label>
                    <Form.Control type="text" disabled value={nftName ?? ""} />
                  </Form.Group>
                </Stack>
                {!poolConfigParameters.flowStateEligibility &&
                  (!pool || poolConfigParameters.nftMintUrl) && (
                    <Form.Group style={{ width: isMobile ? "100%" : "50%" }}>
                      <Form.Label>Mint URL or Contact (Optional)</Form.Label>
                      <Form.Control
                        type="text"
                        disabled={!!pool}
                        onChange={(e) => {
                          setPoolConfigParameters({
                            ...poolConfigParameters,
                            nftMintUrl: e.target.value,
                          });
                          setExistingStrategyAddress("");
                        }}
                        value={poolConfigParameters.nftMintUrl}
                      />
                    </Form.Group>
                  )}
              </>
              <Stack direction={isMobile ? "vertical" : "horizontal"} gap={3}>
                <Button
                  disabled={isNotAllowed}
                  className="d-flex gap-2 justify-content-center align-items-center mt-4 text-light"
                  style={{ width: isMobile ? "100%" : "25%" }}
                  onClick={handleCreatePool}
                >
                  {areTransactionsLoading ? (
                    <>
                      <Spinner size="sm" />
                      {transactionsCompleted + 1}/{totalTransactions}
                    </>
                  ) : isNotAllowed ? (
                    "Launch Pool"
                  ) : (
                    `Launch Pool (${totalTransactions})`
                  )}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!showNextButton || !poolId}
                  className="d-flex gap-2 justify-content-center align-items-center mt-4 p-0 border-0 text-light"
                  style={{ width: isMobile ? "100%" : "25%" }}
                >
                  <Link
                    href={`/sqf/review/?chainId=${chainId}&profileId=${profileId}&poolId=${poolId}`}
                    className="w-100 text-light text-decoration-none"
                    style={{ paddingTop: 6, paddingBottom: 6 }}
                  >
                    Next
                  </Link>
                </Button>
              </Stack>
            </Form>
          )}
        </Stack>
      </Stack>
    </>
  );
}
