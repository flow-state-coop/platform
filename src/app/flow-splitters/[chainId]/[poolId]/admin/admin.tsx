"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Address, parseAbi, isAddress } from "viem";
import {
  useConfig,
  useAccount,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import Papa from "papaparse";
import { waitForReceipt } from "@/lib/utils";
import { writeContract } from "@wagmi/core";
import { useQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import Card from "react-bootstrap/Card";
import Toast from "react-bootstrap/Toast";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import FormCheck from "react-bootstrap/FormCheck";
import Form from "react-bootstrap/Form";
import InfoTooltip from "@/components/InfoTooltip";
import { getApolloClient } from "@/lib/apollo";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import { splitIntoChunks } from "@/app/flow-councils/lib/chunkQueue";
import {
  FLOW_STATE_BOT_ADDRESS,
  KNOWN_ADDRESS_NAMES,
} from "@/app/flow-councils/lib/constants";
import { networks } from "@/lib/networks";
import { isNumber, truncateStr } from "@/lib/utils";
import { parseListed, serializeListed } from "@/lib/listedMetadata";
import SplitterApiCard from "./SplitterApiCard";
import UpdateConfirmModal from "./UpdateConfirmModal";
import { getConfirmWarnings, isRemovingBotAdmin } from "./adminWarnings";
import { useBotPoolAdmin } from "./useBotPoolAdmin";
import { useGrantPoolAdmin } from "./useGrantPoolAdmin";
import { useSplitterApiKeys } from "./useSplitterApiKeys";
import { useSplitterApiStatus } from "./useSplitterApiStatus";

type AdminProps = {
  chainId: number;
  poolId: string;
};

type PoolConfig = {
  transferableUnits: boolean;
  immutable: boolean;
  listed: boolean;
};

type AdminEntry = { address: string; validationError: string };
type MemberEntry = { address: string; units: string; validationError: string };

const PROFILE_BATCH = 150;
const ENS_LOOKUP_LIMIT = 100;

// IFlowSplitter.AdminStatus
const ADMIN_GRANTED = 0;
const ADMIN_REVOKED = 1;

const FLOW_SPLITTER_POOL_QUERY = gql`
  query FlowSplitterPoolQuery($poolId: String!) {
    pools(where: { id: $poolId }) {
      poolAddress
      name
      symbol
      token
      metadata
      poolAdmins {
        address
      }
    }
  }
`;

const SUPERFLUID_QUERY = gql`
  query SuperfluidQuery($token: String!, $gdaPool: String!) {
    token(id: $token) {
      id
      symbol
    }
    pool(id: $gdaPool) {
      id
      poolMembers {
        account {
          id
        }
        units
      }
      poolDistributors(first: 1000, where: { flowRate_not: "0" }) {
        account {
          id
        }
        flowRate
      }
    }
  }
`;

export default function Admin(props: AdminProps) {
  const { poolId, chainId } = props;

  const [poolConfig, setPoolConfig] = useState<PoolConfig>({
    transferableUnits: false,
    immutable: false,
    listed: false,
  });
  const [adminsEntry, setAdminsEntry] = useState<AdminEntry[]>([
    { address: "", validationError: "" },
  ]);
  const [membersEntry, setMembersEntry] = useState<MemberEntry[]>([
    { address: "", units: "", validationError: "" },
  ]);
  const [membersToRemove, setMembersToRemove] = useState<MemberEntry[]>([]);
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [listedLoading, setListedLoading] = useState(false);
  const [listedError, setListedError] = useState("");
  // The listed value currently committed on-chain, used to detect unsaved
  // changes for the Save Visibility button (kept in sync after a save so the
  // button disables immediately, without waiting for the next subgraph poll).
  const [committedListed, setCommittedListed] = useState(false);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const askedForProfile = useRef<Set<string>>(new Set());

  const { isMobile } = useMediaQuery();
  const headerFontSize = isMobile ? "0.7rem" : "inherit";
  // Every column states its own flex: react-bootstrap's `vstack` carries
  // `flex: 1 1 auto`, so a cell wrapped in one grows while its header does not,
  // and the two rows drift apart.
  const addressColumnStyle = isMobile
    ? { flex: "1 1 0%", minWidth: 0 }
    : { flex: "1 1 460px", minWidth: 0, maxWidth: 460 };
  const nameColumnStyle = { flex: "1 1 180px", minWidth: 0 };
  const unitsColumnStyle = { flex: `0 0 ${isMobile ? 76 : 110}px` };
  const shareColumnStyle = { flex: `0 0 ${isMobile ? 76 : 110}px` };
  const shareGroupStyle = { flex: "0 0 auto" };
  const { data: walletClient } = useWalletClient();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const {
    data: flowSplitterPoolQueryRes,
    loading: flowSplitterPoolQueryLoading,
    error: flowSplitterPoolQueryError,
  } = useQuery(FLOW_SPLITTER_POOL_QUERY, {
    client: getApolloClient("flowSplitter", chainId),
    variables: {
      poolId: `0x${Number(poolId).toString(16)}`,
      address: address?.toLowerCase() ?? "",
    },
    pollInterval: 10000,
  });
  const poolAdmins = flowSplitterPoolQueryRes?.pools[0]?.poolAdmins;
  const pool = flowSplitterPoolQueryRes?.pools[0];
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SUPERFLUID_QUERY, {
      client: getApolloClient("superfluid", chainId),
      variables: { token: pool?.token, gdaPool: pool?.poolAddress },
      pollInterval: 10000,
      skip: !pool,
    });
  // Pinned to the pool's chain: unpinned, a wallet connected elsewhere reads a
  // GDA pool address that means nothing on that chain.
  const { data: unitsTrasnferability, isError: unitsTrasnferabilityError } =
    useReadContract({
      chainId,
      address: pool?.poolAddress,
      abi: parseAbi([
        "function transferabilityForUnitsOwner() view returns (bool)",
      ]),
      functionName: "transferabilityForUnitsOwner",
      query: { enabled: !!pool },
    });
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient({ chainId });
  const postHog = usePostHog();

  const network = networks.find((network) => network.id === chainId);
  const poolToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === pool?.token,
  );
  const isValidAdminsEntry = adminsEntry.every(
    (adminEntry) =>
      adminEntry.validationError === "" && adminEntry.address !== "",
  );
  const isValidMembersEntry = membersEntry.every(
    (memberEntry) =>
      memberEntry.validationError === "" &&
      memberEntry.address !== "" &&
      memberEntry.units !== "",
  );
  const isAdmin = !!poolAdmins?.find(
    (poolAdmin: { address: string }) =>
      poolAdmin.address === address?.toLowerCase(),
  );
  const needsSignIn = !session || session.address !== address;
  const {
    botIsAdmin,
    isError: botStatusError,
    refetch: refetchBotStatus,
  } = useBotPoolAdmin(chainId, network?.flowSplitter, poolId);
  // Owned here, not in the API card: a grant and a "No Admin" save go out from
  // the same wallet at consecutive nonces, so whichever is submitted second is
  // guaranteed to be mined second and leave the pool immutable with the bot
  // still holding admin. Each button has to be able to see the other.
  const {
    grant,
    isGranting,
    error: grantError,
  } = useGrantPoolAdmin(chainId, network?.flowSplitter, poolId);
  const {
    hasActiveKeys,
    statusError: apiStatusError,
    reload: reloadApiStatus,
  } = useSplitterApiStatus(chainId, poolId);
  const {
    keys,
    loading: keysLoading,
    loadError: keysError,
    reload: reloadKeys,
  } = useSplitterApiKeys(chainId, poolId, isAdmin && !needsSignIn);

  const totalUnits = useMemo(
    () =>
      membersEntry
        .map((memberEntry) =>
          isNumber(memberEntry.units) ? Number(memberEntry.units) : 0,
        )
        .reduce((a, b) => a + b, 0),
    [membersEntry],
  );

  const hasChanges = useMemo(() => {
    const compareArrays = (a: string[], b: string[]) =>
      a.length === b.length && a.every((elem, i) => elem === b[i]);

    const sortedPoolAdmins = poolAdmins
      ? [...poolAdmins]
          ?.sort((a: { address: string }, b: { address: string }) =>
            a.address > b.address ? -1 : 1,
          )
          .map((admin: { address: string }) => admin.address)
      : [];
    const sortedAdminsEntry = adminsEntry
      ? [...adminsEntry]
          .sort((a, b) =>
            a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
          )
          .map((admin) => admin.address.toLowerCase())
      : [];
    const hasChangesAdmins =
      poolConfig.immutable ||
      (sortedPoolAdmins && !compareArrays(sortedPoolAdmins, sortedAdminsEntry));
    const sortedPoolMembers = superfluidQueryRes?.pool?.poolMembers
      ? [...superfluidQueryRes.pool.poolMembers].sort(
          (a: { account: { id: string } }, b: { account: { id: string } }) =>
            a.account.id > b.account.id ? -1 : 1,
        )
      : [];
    const sortedMembersEntry = membersEntry
      ? [...membersEntry].sort((a, b) =>
          a.address.toLowerCase() > b.address.toLowerCase() ? -1 : 1,
        )
      : [];
    const hasChangesMembers =
      sortedPoolMembers &&
      (!compareArrays(
        sortedPoolMembers
          .filter((member: { units: string }) => member.units !== "0")
          .map((member: { account: { id: string } }) => member.account.id),
        sortedMembersEntry.map((member) => member.address.toLowerCase()),
      ) ||
        !compareArrays(
          sortedPoolMembers
            .filter((member: { units: string }) => member.units !== "0")
            .map((member: { units: string }) => member.units),
          sortedMembersEntry.map((member) => member.units),
        ));

    return hasChangesAdmins || hasChangesMembers ? true : false;
  }, [poolConfig, poolAdmins, adminsEntry, superfluidQueryRes, membersEntry]);

  // Joined-string key: the entry arrays get a new identity on every keystroke,
  // so name lookups gate on the stable key instead of on the arrays. Empty on
  // mobile, where the name column is not rendered at all and the lookups would
  // be pure waste.
  const profileAddressKey = useMemo(
    () =>
      isMobile
        ? ""
        : [
            ...new Set(
              [...adminsEntry, ...membersEntry, ...membersToRemove]
                .map((entry) => entry.address.trim().toLowerCase())
                .filter((entryAddress) => isAddress(entryAddress)),
            ),
          ]
            .sort()
            .join(","),
    [isMobile, adminsEntry, membersEntry, membersToRemove],
  );
  const profileAddresses = useMemo(
    () => (profileAddressKey === "" ? [] : profileAddressKey.split(",")),
    [profileAddressKey],
  );

  // ENS is the last fallback, and it costs one mainnet reverse lookup per
  // address. A share register runs to a thousand recipients, so resolving the
  // whole list would fan out that many calls against a public endpoint. Only
  // addresses no other source named are looked up, capped at a bound the
  // endpoint tolerates.
  const ensAddresses = useMemo(() => {
    const unnamed = profileAddresses.filter(
      (entryAddress) =>
        !KNOWN_ADDRESS_NAMES[entryAddress] && !profileNames[entryAddress],
    );

    return unnamed.slice(0, ENS_LOOKUP_LIMIT);
  }, [profileAddresses, profileNames]);

  const { ensByAddress } = useEnsResolution(ensAddresses, {
    avatars: false,
  });

  const displayName = (entryAddress: string) => {
    const account = entryAddress.trim().toLowerCase();

    return (
      KNOWN_ADDRESS_NAMES[account] ??
      profileNames[account] ??
      ensByAddress?.[account]?.name ??
      ""
    );
  };

  // Irreversible for an integration, so they take an explicit confirm on top of
  // the inline warning above the save button. Both inputs are read without
  // signing in, so the confirm still fires for an admin who only connected a
  // wallet.
  const confirmWarnings = useMemo(
    () =>
      getConfirmWarnings({
        immutable: poolConfig.immutable,
        botIsAdmin,
        hasActiveKeys,
        removingBotAdmin: isRemovingBotAdmin({
          indexedAdmins: (poolAdmins ?? []).map(
            (poolAdmin: { address: string }) => poolAdmin.address,
          ),
          adminsEntry,
          immutable: poolConfig.immutable,
        }),
      }),
    [poolConfig.immutable, botIsAdmin, hasActiveKeys, poolAdmins, adminsEntry],
  );

  const addPoolToWallet = useCallback(() => {
    if (!pool) {
      return;
    }

    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: pool.poolAddress,
          symbol: pool.symbol,
          decimals: 0,
          image: "",
        },
      },
    });
  }, [pool, walletClient]);

  useEffect(() => {
    (async () => {
      if (flowSplitterPoolQueryLoading) {
        return;
      }

      if (poolAdmins) {
        setAdminsEntry(
          poolAdmins.map((poolAdmin: { address: string }) => {
            return { address: poolAdmin.address, validationError: "" };
          }),
        );
      }

      // Initialize the listed toggle from the pool's on-chain metadata.
      // parseListed defends against legacy free-form metadata (e.g. a bare
      // label string) — anything not `{"listed":true}` reads as unlisted.
      const listed = parseListed(pool?.metadata);
      setPoolConfig((prev) => ({ ...prev, listed }));
      setCommittedListed(listed);
    })();
  }, [flowSplitterPoolQueryLoading, pool, poolAdmins]);

  useEffect(() => {
    (async () => {
      if (!superfluidQueryRes?.pool?.poolMembers) {
        return;
      }

      const membersEntry = superfluidQueryRes.pool.poolMembers
        .filter((member: { units: string }) => member.units !== "0")
        .map((member: { account: { id: string }; units: string }) => {
          return {
            address: member.account.id,
            units: member.units,
            validationError: "",
          };
        });

      if (membersEntry.length > 0) {
        setMembersEntry(membersEntry);
      }
    })();
  }, [superfluidQueryRes]);

  useEffect(() => {
    // Only addresses never asked about before: the set changes on every added
    // row, and refetching the whole register each time means a thousand names
    // re-requested to learn one. Tracked separately from `profileNames`, which
    // an address with no profile never enters, so keying off that would retry
    // those forever.
    const unasked = profileAddresses.filter(
      (entryAddress) => !askedForProfile.current.has(entryAddress),
    );

    if (unasked.length === 0) {
      return;
    }

    for (const entryAddress of unasked) {
      askedForProfile.current.add(entryAddress);
    }

    // Batches run together and each merges on its own. Sequentially awaiting
    // seven batches costs seven round trips before a single name appears, and
    // committing one combined map means a single failed batch would blank names
    // that had already resolved. Nothing is discarded when the address set
    // changes mid-flight: a name does not go stale, and dropping the response
    // would strand every address in it, already marked as asked.
    Promise.all(
      splitIntoChunks(unasked, PROFILE_BATCH).map(async (batch) => {
        try {
          const res = await fetch("/api/profiles/names", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: batch }),
          });
          const data = await res.json();

          if (!data.success || !data.names) {
            throw new Error(data.error ?? "Profile name lookup failed");
          }

          const names: Record<string, string> = {};

          for (const [profileAddress, name] of Object.entries(
            data.names as Record<string, string>,
          )) {
            names[profileAddress.toLowerCase()] = name;
          }

          setProfileNames((prev) => ({ ...prev, ...names }));
        } catch (err) {
          // Un-marked so a later run retries: a batch that never answered is
          // not the same as an address with no profile.
          for (const entryAddress of batch) {
            askedForProfile.current.delete(entryAddress);
          }
          console.error(err);
        }
      }),
    );
  }, [profileAddresses]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const removeMemberEntry = (memberEntry: MemberEntry, memberIndex: number) => {
    setMembersEntry((prev) =>
      prev.filter(
        (_, prevMemberEntryIndex) => prevMemberEntryIndex !== memberIndex,
      ),
    );

    const existingPoolMember = superfluidQueryRes?.pool?.poolMembers?.find(
      (member: { account: { id: string } }) =>
        member.account.id === memberEntry.address.toLowerCase(),
    );

    if (
      !memberEntry.validationError &&
      existingPoolMember &&
      existingPoolMember.units !== "0"
    ) {
      setMembersToRemove(membersToRemove.concat(memberEntry));
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) {
      return;
    }

    Papa?.parse(e.target.files[0], {
      complete: (results: { data: string[] }) => {
        const { data } = results;

        const membersEntry: MemberEntry[] = [];

        for (const row of data) {
          if (!row[0]) {
            continue;
          }

          membersEntry.push({
            address: row[0],
            units:
              isNumber(row[1]) && !row[1].includes(".")
                ? row[1].replace(/\s/g, "")
                : "",
            validationError: !isAddress(row[0])
              ? "Invalid Address"
              : membersEntry
                    .map((memberEntry) => memberEntry.address.toLowerCase())
                    .includes(row[0].toLowerCase())
                ? "Address already added"
                : "",
          });
        }

        const membersToRemove = [];

        for (const i in membersEntry) {
          if (membersEntry[i].units === "0") {
            if (!membersEntry[i].validationError) {
              membersToRemove.push(membersEntry[i]);
              membersEntry.splice(Number(i), 1);
            }
          }
        }

        const csvAddresses = data.map((row) => row[0].toLowerCase());
        const existingMembers = superfluidQueryRes?.pool.poolMembers;
        const excludedMembers = existingMembers.filter(
          (existingMember: { account: { id: string }; units: string }) =>
            existingMember.units !== "0" &&
            !csvAddresses.some(
              (address) => existingMember.account.id === address,
            ),
        );

        for (const excludedMember of excludedMembers) {
          membersToRemove.push({
            address: excludedMember.account.id,
            units: excludedMember.units,
            validationError: "",
          });
        }

        setMembersEntry(membersEntry);
        setMembersToRemove(membersToRemove);
      },
    });
  };

  const handleSubmit = async () => {
    if (!network || !address || !publicClient) {
      // Silent here would be indistinguishable from a save the user cancelled
      // in their wallet, which is worse now that a confirm precedes it.
      setTransactionError("Wallet not ready, please reconnect");
      return;
    }

    if (!poolAdmins) {
      // Every admin update below is a diff against this list. Treating an
      // unread one as empty would skip removals silently, and reading it as
      // undefined throws mid-save.
      setTransactionError(
        "Couldn't read this pool's current admins. Please reload and try again.",
      );
      return;
    }

    try {
      setTransactionSuccess("");
      setTransactionError("");
      setIsTransactionLoading(true);

      const validAdmins = adminsEntry.filter(
        (adminEntry) =>
          adminEntry.validationError === "" && adminEntry.address !== "",
      );
      const validMembers = membersEntry.filter(
        (memberEntry) =>
          memberEntry.validationError === "" &&
          memberEntry.address !== "" &&
          !superfluidQueryRes?.pool?.poolMembers.some(
            (member: { account: { id: string }; units: string }) =>
              member.account.id === memberEntry.address &&
              member.units === memberEntry.units,
          ),
      );

      let adminUpdates: { account: Address; status: number }[];

      if (poolConfig.immutable) {
        // "No Admin" revokes only the admins named in the array, so anything
        // absent from it keeps its role. Building that array from the subgraph
        // alone leaves a grant the indexer has not caught up with in place, and
        // the pool ends up immutable with someone still holding admin. Every
        // candidate is therefore confirmed against the chain: the indexed set,
        // whatever the form still lists, the bot, and the caller.
        const candidates = [
          ...new Set(
            [
              ...poolAdmins.map((admin: { address: string }) => admin.address),
              ...adminsEntry.map((adminEntry) => adminEntry.address),
              FLOW_STATE_BOT_ADDRESS,
              address,
            ]
              .map((candidate: string) => candidate.trim().toLowerCase())
              .filter((candidate) => isAddress(candidate)),
          ),
        ];

        let stillAdmin: boolean[];

        try {
          stillAdmin = await Promise.all(
            candidates.map(
              (candidate) =>
                publicClient.readContract({
                  address: network.flowSplitter,
                  abi: flowSplitterAbi,
                  functionName: "isPoolAdmin",
                  args: [BigInt(poolId), candidate as Address],
                }) as Promise<boolean>,
            ),
          );
        } catch (err) {
          console.error(err);

          setTransactionError(
            "Couldn't check this pool's admins onchain. Please try again.",
          );
          setIsTransactionLoading(false);

          return;
        }

        adminUpdates = candidates
          .filter((_, i) => stillAdmin[i])
          .map((adminAddress) => {
            return { account: adminAddress as Address, status: ADMIN_REVOKED };
          });
      } else {
        const validAdminAddresses = validAdmins.map((admin) =>
          admin.address.toLowerCase(),
        );
        const adminsToRemove = poolAdmins
          .map((admin: { address: string }) => admin.address.toLowerCase())
          .filter(
            (adminAddress: string) =>
              !validAdminAddresses.includes(adminAddress),
          );

        adminUpdates = validAdmins
          .map((admin) => {
            return {
              account: admin.address as Address,
              status: ADMIN_GRANTED,
            };
          })
          .concat(
            adminsToRemove.map((adminAddress: string) => {
              return {
                account: adminAddress as Address,
                status: ADMIN_REVOKED,
              };
            }),
          );
      }

      const hash = await writeContract(wagmiConfig, {
        address: network.flowSplitter,
        abi: flowSplitterAbi,
        functionName: "updatePool",
        args: [
          BigInt(poolId),
          validMembers
            .map((member) => {
              return {
                account: member.address as Address,
                units: BigInt(member.units),
              };
            })
            .concat(
              membersToRemove.map((member) => {
                return { account: member.address as Address, units: BigInt(0) };
              }),
            ),
          adminUpdates,
          // Pass the current on-chain metadata through so a members/admins
          // edit never clobbers the listed flag (the dedicated visibility
          // action below owns metadata changes).
          pool?.metadata ?? "",
        ],
      });

      // waitForTransactionReceipt resolves on a revert rather than throwing, so
      // without this a reverted update would report success and clear the
      // pending removals while nothing changed onchain.
      const receipt = await waitForReceipt(publicClient, hash);

      if (receipt.status === "reverted") {
        setTransactionError("The transaction reverted. Please try again.");
        setIsTransactionLoading(false);

        return;
      }

      setIsTransactionLoading(false);
      setTransactionSuccess("Flow Splitter Updated Successfully");
      setMembersToRemove([]);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  const handleUpdateMetadata = async () => {
    if (!network || !address || !publicClient) {
      return;
    }

    try {
      setListedError("");
      setListedLoading(true);

      const hash = await writeContract(wagmiConfig, {
        address: network.flowSplitter,
        abi: flowSplitterAbi,
        functionName: "updatePoolMetadata",
        // serializeListed writes the canonical single-key blob — same as the
        // create path (launch.tsx) and the helper's contract. Any legacy
        // free-form metadata is replaced; only `listed` is stored.
        args: [BigInt(poolId), serializeListed(poolConfig.listed)],
      });

      const receipt = await waitForReceipt(publicClient, hash);

      if (receipt.status === "reverted") {
        setListedError("The transaction reverted. Please try again.");
        setListedLoading(false);

        return;
      }

      setListedLoading(false);
      setCommittedListed(poolConfig.listed);
      setTransactionSuccess("Visibility Updated Successfully");
    } catch (err) {
      console.error(err);

      setListedError("Transaction Error");
      setListedLoading(false);
    }
  };

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        {flowSplitterPoolQueryLoading || superfluidQueryLoading ? (
          <span className="position-absolute top-50 start-50 translate-middle">
            <Spinner />
          </span>
        ) : !network ? (
          <p className="w-100 mt-5 fs-4 text-center">Network Not Found</p>
        ) : (
          <>
            <h1 className="d-flex flex-column flex-sm-row align-items-sm-center overflow-hidden gap-sm-1 fs-3">
              <span className="text-truncate">
                {pool && pool.name !== "Superfluid Pool"
                  ? pool.name
                  : "Flow Splitter"}{" "}
                <span className="d-none d-sm-inline-block">(</span>
              </span>
              <Stack direction="horizontal" gap={1}>
                <Link
                  href={`${network.superfluidExplorer}/pools/${pool.poolAddress}`}
                  target="_blank"
                >
                  {truncateStr(pool.poolAddress, 14)}
                </Link>
                <span className="d-none d-sm-inline-block">)</span>
                <Button
                  variant="transparent"
                  className="d-flex align-items-center mt-2 p-0 border-0"
                  onClick={() =>
                    !address && openConnectModal
                      ? openConnectModal()
                      : connectedChain?.id !== chainId
                        ? switchChain({ chainId })
                        : addPoolToWallet()
                  }
                >
                  <InfoTooltip
                    position={{ top: true }}
                    target={<Image width={48} src="/wallet.svg" alt="wallet" />}
                    content={<p className="m-0 p-2">Add to Wallet</p>}
                  />
                </Button>
              </Stack>
            </h1>
            <Stack direction="horizontal" gap={1} className="fs-lg">
              Distributing{" "}
              {poolToken && (
                <Image src={poolToken.icon} alt="" width={18} height={18} />
              )}
              {superfluidQueryRes?.token.symbol} on
              <Image src={network.icon} alt="" width={18} height={18} />
              {network.name}
            </Stack>
            <Card className="bg-lace-100 rounded-4 border-0 mt-10 px-10 py-8">
              <Card.Body className="p-0">
                <Card.Text className="text-info">
                  Configuration in this section cannot be edited after
                  deployment.
                </Card.Text>
                <Dropdown>
                  <Dropdown.Toggle
                    className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                    style={{ width: 156, paddingTop: 12, paddingBottom: 12 }}
                    disabled
                  >
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="align-items-center"
                    >
                      <Image
                        src={network.icon}
                        alt="Network Icon"
                        width={18}
                        height={18}
                      />
                      {network.name}
                    </Stack>
                  </Dropdown.Toggle>
                </Dropdown>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={isMobile ? 1 : 3}
                  className="align-items-start mt-2"
                >
                  <Dropdown>
                    <Dropdown.Toggle
                      className="d-flex justify-content-between align-items-center bg-white text-dark border-0 fw-semi-bold"
                      disabled
                      style={{
                        width: 156,
                        paddingTop: 12,
                        paddingBottom: 12,
                      }}
                    >
                      <Stack
                        direction="horizontal"
                        gap={1}
                        className="align-items-center"
                      >
                        {poolToken && (
                          <Image
                            src={poolToken.icon}
                            alt="Network Icon"
                            width={18}
                            height={18}
                          />
                        )}
                        {superfluidQueryRes?.token.symbol}
                      </Stack>
                    </Dropdown.Toggle>
                  </Dropdown>
                  <Stack direction="vertical" className="align-self-sm-end">
                    <Form.Control
                      type="text"
                      disabled
                      value={superfluidQueryRes?.token.id}
                      className="bg-white border-0 fw-semi-bold"
                      style={{
                        width: !isMobile ? "50%" : "",
                        paddingTop: 10,
                        paddingBottom: 10,
                      }}
                    />
                  </Stack>
                </Stack>
                <Stack direction="vertical" className="mt-6">
                  <Form.Label className="d-flex gap-1 mb-3 fs-6 text-secondary fw-semi-bold">
                    Share Transferability
                    <InfoTooltip
                      position={{ top: true }}
                      target={
                        <Image
                          src="/info.svg"
                          alt="Info"
                          width={14}
                          height={14}
                          className="align-top"
                        />
                      }
                      content={
                        <p className="m-0 p-2">
                          Should recipients be able to transfer (or trade) their
                          shares?
                          <br />
                          <br />
                          Carefully consider the implications with your Contract
                          Admin selection below and your particular use case
                          before choosing to enable transferability. This is not
                          editable after launch.
                        </p>
                      }
                    />
                  </Form.Label>
                  <Stack direction="horizontal" gap={5}>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        disabled
                        checked={!unitsTrasnferability}
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Non-Transferable (Admin Only)
                      </FormCheck.Label>
                    </FormCheck>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        disabled
                        checked={!!unitsTrasnferability}
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Transferable by Recipients
                      </FormCheck.Label>
                    </FormCheck>
                  </Stack>
                </Stack>
              </Card.Body>
            </Card>
            <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
                Contract Admin
                <InfoTooltip
                  position={{ top: true }}
                  target={
                    <Image
                      src="/info.svg"
                      alt="Info"
                      width={14}
                      height={14}
                      className="align-top"
                    />
                  }
                  content={
                    <p className="m-0 p-2">
                      Set the address(es), including multisigs, that should be
                      able to update the shares of your Flow Splitter for your
                      use case.
                      <br />
                      <br />
                      Admins can relinquish, transfer, or add others to the
                      admin role. If there are no admins, your Flow Splitter
                      contract is immutable.
                    </p>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0">
                <Form.Group>
                  <Stack direction="horizontal" gap={5}>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        checked={!poolConfig.immutable}
                        disabled={!isAdmin}
                        onChange={() =>
                          setPoolConfig({
                            ...poolConfig,
                            immutable: false,
                          })
                        }
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Admin
                      </FormCheck.Label>
                    </FormCheck>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        checked={!!poolConfig.immutable}
                        disabled={!isAdmin}
                        onChange={() =>
                          setPoolConfig({
                            ...poolConfig,
                            immutable: true,
                          })
                        }
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        No Admin
                      </FormCheck.Label>
                    </FormCheck>
                  </Stack>
                  {!poolConfig.immutable && (
                    <div className="mt-4">
                      <Stack
                        direction="horizontal"
                        gap={2}
                        className="align-items-center mb-1"
                      >
                        <Card.Text
                          className="m-0 flex-grow-1 ps-3"
                          style={{
                            ...addressColumnStyle,
                            fontSize: headerFontSize,
                          }}
                        >
                          Address
                        </Card.Text>
                        {!isMobile && (
                          <Card.Text
                            className="m-0 ps-3"
                            style={{
                              ...nameColumnStyle,
                              fontSize: headerFontSize,
                            }}
                          >
                            Profile Name
                          </Card.Text>
                        )}
                        <span className="p-0 opacity-0">
                          <Image
                            src="/close.svg"
                            alt=""
                            width={28}
                            height={28}
                          />
                        </span>
                      </Stack>
                      {adminsEntry.map((adminEntry, i) => (
                        <Stack
                          direction="vertical"
                          className="position-relative mb-3"
                          key={i}
                        >
                          <Stack
                            direction="horizontal"
                            gap={2}
                            className="align-items-center"
                          >
                            <Form.Control
                              key={i}
                              type="text"
                              placeholder="Admin Address"
                              value={adminEntry.address}
                              disabled={!isAdmin}
                              className="border-0 flex-grow-1 fw-semi-bold"
                              style={{
                                ...addressColumnStyle,
                                paddingTop: 12,
                                paddingBottom: 12,
                              }}
                              onChange={(e) => {
                                const prevAdminsEntry = [...adminsEntry];
                                const value = e.target.value;

                                if (!isAddress(value)) {
                                  prevAdminsEntry[i].validationError =
                                    "Invalid Address";
                                } else if (
                                  prevAdminsEntry
                                    .map((prevAdmin) =>
                                      prevAdmin.address.toLowerCase(),
                                    )
                                    .includes(value.toLowerCase())
                                ) {
                                  prevAdminsEntry[i].validationError =
                                    "Address already added";
                                } else {
                                  prevAdminsEntry[i].validationError = "";
                                }

                                prevAdminsEntry[i].address = value;

                                setAdminsEntry(prevAdminsEntry);
                              }}
                            />
                            {!isMobile && (
                              <Form.Control
                                type="text"
                                disabled
                                aria-label="Admin Profile Name"
                                value={displayName(adminEntry.address) || "N/A"}
                                className="border-0 bg-white fw-semi-bold text-info"
                                style={{
                                  ...nameColumnStyle,
                                  paddingTop: 12,
                                  paddingBottom: 12,
                                }}
                              />
                            )}
                            <Button
                              variant="transparent"
                              className="p-0 border-0"
                              disabled={!isAdmin}
                              onClick={() => {
                                setAdminsEntry((prev) =>
                                  prev.filter(
                                    (_, prevAdminEntryIndex) =>
                                      prevAdminEntryIndex !== i,
                                  ),
                                );
                              }}
                            >
                              <Image
                                src="/close.svg"
                                alt="Remove"
                                width={28}
                                height={28}
                              />
                            </Button>
                          </Stack>
                          {adminEntry.validationError ? (
                            <Card.Text
                              className="position-absolute mb-0 ms-2 ps-1 text-danger"
                              style={{ bottom: 1, fontSize: "0.7rem" }}
                            >
                              {adminEntry.validationError}
                            </Card.Text>
                          ) : null}
                        </Stack>
                      ))}
                      <Button
                        variant="transparent"
                        disabled={!isAdmin}
                        className="p-0 text-primary text-decoration-underline border-0"
                        onClick={() =>
                          setAdminsEntry((prev) =>
                            prev.concat({
                              address: "",
                              validationError: "",
                            }),
                          )
                        }
                      >
                        <Card.Text className="mb-0 ms-sm-2 ps-sm-1 fw-semi-bold">
                          Add another admin
                        </Card.Text>
                      </Button>
                    </div>
                  )}
                </Form.Group>
              </Card.Body>
            </Card>
            <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
                Share Register ({pool?.symbol ? pool.symbol : "POOL"})
                <InfoTooltip
                  position={{ top: true }}
                  target={
                    <Image
                      src="/info.svg"
                      alt="Info"
                      width={18}
                      height={18}
                      className="align-top"
                    />
                  }
                  content={
                    <p className="m-0 p-2">
                      As tokens are streamed to the Flow Splitter, they're
                      proportionally distributed in real time to recipients
                      according to their percentage of the total outstanding
                      shares.
                      <br />
                      <br />
                      Any changes to the total number of outstanding or a
                      recipient's shares will be reflected in the continuing
                      stream allocation.
                    </p>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0">
                {hasActiveKeys ? (
                  <Alert
                    variant="warning"
                    className="w-100 p-4 mb-4 fw-semi-bold"
                  >
                    This pool is API-controlled. Manual changes stay until the
                    next API write, which replaces the whole register.
                  </Alert>
                ) : apiStatusError ? (
                  // Silence here reads as "not API-controlled", and an admin
                  // who believes that signs an edit the next API write undoes.
                  <Alert
                    variant="warning"
                    className="w-100 p-4 mb-4 fw-semi-bold"
                  >
                    Couldn&apos;t check whether this pool is API-controlled. If
                    it is, manual changes are replaced by the next API write.
                  </Alert>
                ) : null}
                <Stack
                  direction="horizontal"
                  gap={isMobile ? 2 : 4}
                  className="justify-content-start align-items-center mb-1"
                >
                  <Card.Text
                    className="m-0 flex-grow-1 ps-3"
                    style={{
                      ...addressColumnStyle,
                      fontSize: headerFontSize,
                    }}
                  >
                    Address
                  </Card.Text>
                  {!isMobile && (
                    <Card.Text
                      className="m-0 ps-3"
                      style={{ ...nameColumnStyle, fontSize: headerFontSize }}
                    >
                      Profile Name
                    </Card.Text>
                  )}
                  <Card.Text
                    className="m-0 text-center"
                    style={{ ...unitsColumnStyle, fontSize: headerFontSize }}
                  >
                    Shares
                  </Card.Text>
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 1 : 2}
                    className="align-items-center"
                  >
                    <Card.Text
                      className="m-0 text-center"
                      style={{ ...shareColumnStyle, fontSize: headerFontSize }}
                    >
                      Share %
                    </Card.Text>
                    <span className="p-0 opacity-0">
                      <Image src="/close.svg" alt="" width={28} height={28} />
                    </span>
                  </Stack>
                </Stack>
                {membersEntry.map((memberEntry, i) => (
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 2 : 4}
                    className="justify-content-start mb-3"
                    key={i}
                  >
                    <Stack
                      direction="vertical"
                      className="flex-grow-1"
                      style={addressColumnStyle}
                    >
                      <Stack direction="vertical" className="position-relative">
                        <Form.Control
                          type="text"
                          disabled={
                            !isAdmin ||
                            (superfluidQueryRes?.pool?.poolMembers
                              .map((member: { account: { id: string } }) =>
                                member.account.id.toLowerCase(),
                              )
                              .includes(memberEntry.address.toLowerCase()) &&
                              !memberEntry.validationError)
                          }
                          placeholder="Recipient Address"
                          value={memberEntry.address}
                          className="bg-white border-0 fw-semi-bold"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                          onChange={(e) => {
                            const value = e.target.value;

                            setMembersEntry(
                              membersEntry.map((entry, index) => {
                                if (index !== i) return entry;

                                let validationError = "";

                                if (!isAddress(value)) {
                                  validationError = "Invalid Address";
                                } else if (
                                  membersEntry.some(
                                    (other, j) =>
                                      j !== i &&
                                      other.address.toLowerCase() ===
                                        value.toLowerCase(),
                                  )
                                ) {
                                  validationError = "Address already added";
                                }

                                return {
                                  ...entry,
                                  address: value,
                                  validationError,
                                };
                              }),
                            );
                          }}
                        />
                        {memberEntry.validationError ? (
                          <Card.Text
                            className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger"
                            style={{ bottom: 1, fontSize: "0.7rem" }}
                          >
                            {memberEntry.validationError}
                          </Card.Text>
                        ) : null}
                      </Stack>
                    </Stack>
                    {!isMobile && (
                      <Form.Control
                        type="text"
                        disabled
                        aria-label="Recipient Profile Name"
                        value={displayName(memberEntry.address) || "N/A"}
                        className="bg-white border-0 fw-semi-bold text-info"
                        style={{
                          ...nameColumnStyle,
                          paddingTop: 12,
                          paddingBottom: 12,
                        }}
                      />
                    )}
                    <Stack direction="vertical" style={unitsColumnStyle}>
                      <Form.Control
                        type="text"
                        inputMode="numeric"
                        aria-label="Recipient Shares"
                        disabled={!isAdmin}
                        value={memberEntry.units}
                        className="bg-white border-0 fw-semi-bold text-center"
                        style={{ paddingTop: 12, paddingBottom: 12 }}
                        onChange={(e) => {
                          const value = e.target.value;

                          if (value && value.includes(".")) return;

                          if (value === "0") {
                            removeMemberEntry(membersEntry[i], i);
                            return;
                          }

                          if (!value || isNumber(value)) {
                            setMembersEntry(
                              membersEntry.map((entry, index) =>
                                index === i
                                  ? { ...entry, units: value || "" }
                                  : entry,
                              ),
                            );
                          }
                        }}
                      />
                    </Stack>
                    <Stack direction="vertical" style={shareGroupStyle}>
                      <Stack
                        direction="horizontal"
                        gap={isMobile ? 1 : 2}
                        className="align-items-center"
                      >
                        <Form.Control
                          type="text"
                          placeholder="%"
                          disabled
                          value={
                            !memberEntry.units ||
                            Number(memberEntry.units) === 0
                              ? ""
                              : `${parseFloat(
                                  (
                                    (Number(memberEntry.units) /
                                      membersEntry
                                        .map((memberEntry) =>
                                          isNumber(memberEntry.units)
                                            ? Number(memberEntry.units)
                                            : 0,
                                        )
                                        .reduce((a, b) => a + b, 0)) *
                                    100
                                  ).toFixed(isMobile ? 1 : 2),
                                )}%`
                          }
                          className="bg-white border-0 fw-semi-bold text-center"
                          style={{
                            ...shareColumnStyle,
                            paddingTop: 12,
                            paddingBottom: 12,
                          }}
                        />
                        <Button
                          variant="transparent"
                          disabled={!isAdmin}
                          className="p-0 border-0"
                          onClick={() => removeMemberEntry(memberEntry, i)}
                        >
                          <Image
                            src="/close.svg"
                            alt="Remove"
                            width={28}
                            height={28}
                          />
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                ))}
                {membersToRemove.map((memberEntry, i) => (
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 2 : 4}
                    className="justify-content-start mb-3"
                    key={i}
                  >
                    <Stack
                      direction="vertical"
                      className="flex-grow-1"
                      style={addressColumnStyle}
                    >
                      <Stack direction="vertical" className="position-relative">
                        <Form.Control
                          disabled
                          type="text"
                          value={memberEntry.address}
                          className="bg-white border-0 fw-semi-bold"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        />
                      </Stack>
                    </Stack>
                    {!isMobile && (
                      <Form.Control
                        type="text"
                        disabled
                        aria-label="Removed Recipient Profile Name"
                        value={displayName(memberEntry.address) || "N/A"}
                        className="bg-white border-0 fw-semi-bold text-info"
                        style={{
                          ...nameColumnStyle,
                          paddingTop: 12,
                          paddingBottom: 12,
                        }}
                      />
                    )}
                    <Stack direction="vertical" style={unitsColumnStyle}>
                      <Form.Control
                        type="text"
                        disabled
                        inputMode="numeric"
                        aria-label="Removed Recipient Shares"
                        value="0"
                        className="bg-white border-0 fw-semi-bold text-center"
                        style={{ paddingTop: 12, paddingBottom: 12 }}
                      />
                    </Stack>
                    <Stack direction="vertical" style={shareGroupStyle}>
                      <Stack
                        direction="horizontal"
                        gap={isMobile ? 1 : 2}
                        className="align-items-center"
                      >
                        <Form.Control
                          type="text"
                          disabled
                          aria-label="Removed Recipient Share %"
                          value="Removed"
                          className="bg-white border-0 fw-semi-bold text-center"
                          style={{
                            ...shareColumnStyle,
                            paddingTop: 12,
                            paddingBottom: 12,
                          }}
                        />
                        <Button
                          variant="transparent"
                          disabled={!isAdmin}
                          className="p-0 border-0"
                          onClick={() => {
                            setMembersToRemove((prev) =>
                              prev.filter(
                                (_, prevMemberEntryIndex) =>
                                  prevMemberEntryIndex !== i,
                              ),
                            );
                            setMembersEntry(membersEntry.concat(memberEntry));
                          }}
                        >
                          <Image
                            src="/add-circle.svg"
                            alt="Add"
                            width={28}
                            height={28}
                          />
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                ))}
                <Stack
                  direction="horizontal"
                  gap={isMobile ? 2 : 4}
                  className="align-items-center"
                >
                  <Button
                    variant="transparent"
                    disabled={!isAdmin}
                    className="d-flex align-items-center flex-grow-1 p-0 text-primary text-decoration-underline border-0"
                    style={addressColumnStyle}
                    onClick={() =>
                      setMembersEntry((prev) =>
                        prev.concat({
                          address: "",
                          units: "",
                          validationError: "",
                        }),
                      )
                    }
                  >
                    <Card.Text className="mb-0 ms-2 ps-1 fw-semi-bold">
                      {isMobile ? "Add recipient" : "Add another recipient"}
                    </Card.Text>
                  </Button>
                  {!isMobile && <span style={nameColumnStyle} />}
                  <Stack style={unitsColumnStyle}>
                    <Form.Control
                      type="text"
                      disabled
                      aria-label="Total Shares"
                      className="bg-transparent text-info text-center border-0 fw-semi-bold"
                      value={totalUnits}
                    />
                  </Stack>
                  <Stack
                    direction="horizontal"
                    gap={isMobile ? 1 : 2}
                    className="align-items-center"
                  >
                    <Form.Control
                      type="text"
                      disabled
                      aria-label="Total Share %"
                      value="100%"
                      className="bg-transparent border-0 text-center fw-semi-bold"
                      style={shareColumnStyle}
                    />
                    <span className="p-0 opacity-0">
                      <Image
                        src="/close.svg"
                        alt="Remove"
                        width={28}
                        height={28}
                      />
                    </span>
                  </Stack>
                </Stack>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  gap={2}
                  className="justify-content-end mt-6"
                >
                  <Card.Link
                    href={URL.createObjectURL(
                      new Blob([
                        Papa.unparse(
                          membersEntry.map((memberEntry) => {
                            return [memberEntry.address, memberEntry.units];
                          }),
                        ),
                      ]),
                    )}
                    target="_blank"
                    download="Flow_Splitter.csv"
                    className="m-0 bg-secondary px-10 py-4 rounded-4 text-light fw-semi-bold text-decoration-none"
                  >
                    Export Current
                  </Card.Link>
                  <>
                    <Form.Label
                      htmlFor="upload-csv"
                      className={`text-white fw-semi-bold text-center m-0 px-10 py-4 rounded-4 ${isAdmin ? "bg-primary cursor-pointer" : "bg-info opacity-75"}`}
                    >
                      Upload CSV
                    </Form.Label>
                    <Form.Control
                      type="file"
                      id="upload-csv"
                      accept=".csv"
                      hidden
                      disabled={!isAdmin}
                      onChange={handleCsvUpload}
                    />
                  </>
                </Stack>
                <Card.Link
                  href="https://docs.google.com/spreadsheets/d/13oBKSJzKfW0yC8ghiZ_3EYWrjlZ9g8BU-mV91ezG_XU/edit?gid=0#gid=0"
                  target="_blank"
                  className="float-end mt-2 pe-1 text-primary fw-semi-bold"
                >
                  Template
                </Card.Link>
              </Card.Body>
            </Card>
            <Card className="bg-lace-100 rounded-4 border-0 mt-8 p-4">
              <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
                Discovery Visibility
                <InfoTooltip
                  position={{ top: true }}
                  target={
                    <Image
                      src="/info.svg"
                      alt="Info"
                      width={18}
                      height={18}
                      className="align-top"
                    />
                  }
                  content={
                    <p className="m-0 p-2">
                      Listed Flow Splitters may be surfaced on the Explore page.
                      Unlisted ones stay accessible via direct link. Changing
                      this requires an on-chain transaction.
                    </p>
                  }
                />
              </Card.Header>
              <Card.Body className="p-0 mt-4">
                <Form.Group>
                  <Stack direction="horizontal" gap={5}>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        name="discovery-visibility"
                        checked={!poolConfig.listed}
                        disabled={!isAdmin}
                        onChange={() =>
                          setPoolConfig({ ...poolConfig, listed: false })
                        }
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Unlisted
                      </FormCheck.Label>
                    </FormCheck>
                    <FormCheck type="radio">
                      <FormCheck.Input
                        type="radio"
                        name="discovery-visibility"
                        checked={!!poolConfig.listed}
                        disabled={!isAdmin}
                        onChange={() =>
                          setPoolConfig({ ...poolConfig, listed: true })
                        }
                      />
                      <FormCheck.Label className="fw-semi-bold">
                        Listed
                      </FormCheck.Label>
                    </FormCheck>
                  </Stack>
                  <Button
                    disabled={
                      !isAdmin ||
                      listedLoading ||
                      poolConfig.listed === committedListed
                    }
                    className="mt-4 px-8 py-3 rounded-4 fw-semi-bold"
                    onClick={() =>
                      !address && openConnectModal
                        ? openConnectModal()
                        : connectedChain?.id !== chainId
                          ? switchChain({ chainId })
                          : handleUpdateMetadata()
                    }
                  >
                    {listedLoading ? (
                      <Spinner size="sm" className="ms-2" />
                    ) : (
                      "Save Visibility"
                    )}
                  </Button>
                  {listedError ? (
                    <Alert
                      variant="danger"
                      className="w-100 mt-4 p-4 fw-semi-bold"
                    >
                      {listedError}
                    </Alert>
                  ) : null}
                </Form.Group>
              </Card.Body>
            </Card>
            <SplitterApiCard
              network={network}
              poolId={poolId}
              isAdmin={isAdmin}
              // Undefined while the pool read is unresolved or has failed. A
              // pool with no admins really is permanently immutable, so
              // collapsing "could not read" into that says so to an admin whose
              // pool is fine.
              hasAdmins={poolAdmins ? poolAdmins.length > 0 : undefined}
              hasAdminsError={
                !!flowSplitterPoolQueryError ||
                (!flowSplitterPoolQueryLoading && !pool)
              }
              transferableUnits={unitsTrasnferability}
              transferabilityError={unitsTrasnferabilityError}
              needsSignIn={needsSignIn}
              walletActionLabel={
                !address
                  ? "Connect Wallet"
                  : connectedChain?.id !== chainId
                    ? "Switch Network"
                    : null
              }
              onPrepareWallet={() => {
                if (!address && openConnectModal) {
                  openConnectModal();
                } else if (connectedChain?.id !== chainId) {
                  switchChain({ chainId });
                }
              }}
              onSignIn={handleSignIn}
              botIsAdmin={botIsAdmin}
              botStatusError={botStatusError}
              grant={async () => {
                if (await grant()) {
                  refetchBotStatus();
                }
              }}
              isGranting={isGranting}
              isSaving={isTransactionLoading}
              grantError={grantError}
              keys={keys}
              keysLoading={keysLoading}
              keysError={keysError}
              reloadKeys={reloadKeys}
              onKeysChanged={reloadApiStatus}
            />
            <Stack direction="vertical" className="mt-8">
              {poolConfig.immutable && (
                <Card.Text className="mb-2 text-danger">
                  Warning: You are changing your contract to "No Admin." You
                  won't be able to make changes after this transaction.
                </Card.Text>
              )}
              {poolConfig.immutable &&
                botIsAdmin === undefined &&
                (botStatusError ? (
                  // A read that has permanently failed does not gate the save:
                  // the revoke set is confirmed against the chain at submit
                  // time, bot included, so this only costs the sharper of the
                  // two confirm warnings.
                  <Card.Text className="mb-2 text-info">
                    Couldn&apos;t check whether the Flow State bot holds admin.
                    Saving re-reads the admin set onchain and revokes everything
                    it confirms, the bot included, so it goes through only once
                    that read recovers.
                  </Card.Text>
                ) : (
                  // Otherwise the disabled button below has no explanation.
                  <Card.Text className="mb-2 text-info">
                    Checking whether the Flow State bot holds admin. Saving is
                    blocked until that answers, so the revoke can include it.
                  </Card.Text>
                ))}
              <Button
                disabled={
                  isTransactionLoading ||
                  // A grant is broadcast but not yet mined: this save would go
                  // out behind it at the next nonce, so a "No Admin" revoke set
                  // computed now is guaranteed to be one address short.
                  isGranting ||
                  (poolConfig.immutable &&
                    botIsAdmin === undefined &&
                    !botStatusError) ||
                  !hasChanges ||
                  (!poolConfig.immutable && !isValidAdminsEntry) ||
                  !isValidMembersEntry
                }
                className="w-100 py-4 rounded-4 fs-6 fw-semi-bold"
                onClick={() =>
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== chainId
                      ? switchChain({ chainId })
                      : confirmWarnings.length > 0
                        ? setShowConfirmModal(true)
                        : handleSubmit()
                }
              >
                {isTransactionLoading ? (
                  <Spinner size="sm" className="ms-2" />
                ) : (
                  "Update Flow Splitter"
                )}
              </Button>
            </Stack>
            <UpdateConfirmModal
              show={showConfirmModal}
              warnings={confirmWarnings}
              onConfirm={() => {
                setShowConfirmModal(false);
                handleSubmit();
              }}
              onClose={() => setShowConfirmModal(false)}
            />
            <Toast
              show={!!transactionSuccess}
              autohide
              delay={5000}
              onClose={() => setTransactionSuccess("")}
              className="w-100 p-4 mt-4 fs-6 fw-semi-bold"
              style={{
                background: "rgb(209, 231, 220.8)",
                color: "rgb(10, 54, 33.6)",
                borderColor: "rgb(163, 207, 186.6)",
              }}
            >
              Flow Splitter Updated Successfully!
            </Toast>
            {transactionError ? (
              <Alert variant="danger" className="w-100 mt-4 p-4 fw-semi-bold">
                {transactionError}
              </Alert>
            ) : null}
          </>
        )}
      </Stack>
    </>
  );
}
