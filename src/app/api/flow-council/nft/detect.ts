import {
  ContractFunctionZeroDataError,
  BaseError,
  type Address,
  type PublicClient,
} from "viem";
import {
  erc165Abi,
  erc721MinimalAbi,
  erc1155MinimalAbi,
  erc20MarkerAbi,
  ERC721_INTERFACE_ID,
  ERC1155_INTERFACE_ID,
  CATCH_ALL_INTERFACE_ID,
} from "@/lib/abi/nft";

export type NftTokenStandard = "erc721" | "erc1155";

export type NftDetectionFailure =
  | "no_contract"
  | "no_erc165"
  | "unsupported_interface"
  | "unreliable_erc165"
  | "read_failed";

export type NftDetectionResult =
  | {
      status: "detected";
      standard: NftTokenStandard;
      collectionName?: string;
    }
  | { status: NftDetectionFailure };

export type OverrideVerification =
  | { ok: true }
  | {
      ok: false;
      reason: "looks_like_token" | "missing_interface" | "read_failed";
    };

// Both standards revert balanceOf for the zero address (OpenZeppelin rejects it
// as an invalid owner), so the probe has to ask about a real-looking one.
const PROBE_HOLDER = "0x0000000000000000000000000000000000000001" as const;

export const NFT_DETECTION_MESSAGES = {
  no_contract: "No contract found at that address on this chain.",
  no_erc165:
    "That contract doesn't advertise a token standard we can read. Pick the standard manually if you're sure it's an NFT collection.",
  unsupported_interface:
    "That contract advertises neither ERC-721 nor ERC-1155. Pick the standard manually if you're sure it's an NFT collection.",
  unreliable_erc165:
    "That contract's self-description is unreliable, so we can't confirm its standard.",
  read_failed: "Couldn't reach the network to check that address. Try again.",
  looks_like_token: "This looks like a token contract, not an NFT collection.",
  missing_interface:
    "That contract doesn't expose the functions the selected standard requires.",
} as const;

type MulticallEntry =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

type ProbeClient = Pick<PublicClient, "getCode" | "multicall">;

function decoded(entry: MulticallEntry | undefined): boolean {
  return entry?.status === "success";
}

function isZeroData(entry: MulticallEntry | undefined): boolean {
  if (entry?.status !== "failure") {
    return false;
  }

  const error = entry.error;

  if (error instanceof ContractFunctionZeroDataError) {
    return true;
  }

  return (
    error instanceof BaseError &&
    !!error.walk((cause) => cause instanceof ContractFunctionZeroDataError)
  );
}

export async function detectNftStandard(
  client: ProbeClient,
  address: Address,
): Promise<NftDetectionResult> {
  // An EOA surfaces as a decode error, not a clean answer, so code comes first.
  let code: string | undefined;

  try {
    code = await client.getCode({ address });
  } catch {
    return { status: "read_failed" };
  }

  if (!code || code === "0x") {
    return { status: "no_contract" };
  }

  const interfaceIds = [
    ERC721_INTERFACE_ID,
    ERC1155_INTERFACE_ID,
    CATCH_ALL_INTERFACE_ID,
  ] as const;

  let entries: MulticallEntry[];

  try {
    entries = (await client.multicall({
      allowFailure: true,
      contracts: interfaceIds.map((interfaceId) => ({
        address,
        abi: erc165Abi,
        functionName: "supportsInterface",
        args: [interfaceId],
      })),
    })) as MulticallEntry[];
  } catch {
    return { status: "read_failed" };
  }

  const [supports721, supports1155, supportsCatchAll] = entries;

  if (entries.every((entry) => entry.status === "failure")) {
    return { status: "no_erc165" };
  }

  if (supportsCatchAll?.status === "success" && supportsCatchAll.result) {
    return { status: "unreliable_erc165" };
  }

  const standard: NftTokenStandard | null =
    supports721?.status === "success" && supports721.result
      ? "erc721"
      : supports1155?.status === "success" && supports1155.result
        ? "erc1155"
        : null;

  if (!standard) {
    return { status: "unsupported_interface" };
  }

  const collectionName = await readCollectionName(client, address, standard);

  return collectionName
    ? { status: "detected", standard, collectionName }
    : { status: "detected", standard };
}

async function readCollectionName(
  client: ProbeClient,
  address: Address,
  standard: NftTokenStandard,
): Promise<string | undefined> {
  try {
    const [name] = (await client.multicall({
      allowFailure: true,
      contracts: [
        {
          address,
          abi: standard === "erc721" ? erc721MinimalAbi : erc1155MinimalAbi,
          functionName: "name",
        },
      ],
    })) as MulticallEntry[];

    if (name?.status === "success" && typeof name.result === "string") {
      return name.result;
    }
  } catch {
    // A missing or unreadable name is non-fatal; the label falls back to the
    // truncated address.
  }

  return undefined;
}

export async function verifyOverrideStandard(
  client: ProbeClient,
  address: Address,
  standard: NftTokenStandard,
): Promise<OverrideVerification> {
  // Detection failing is not permission to trust the admin's pick. An ordinary
  // ERC-20 lands in no_erc165, and accepting one as a collection would grant
  // votes to every token holder.
  const balanceProbe =
    standard === "erc721"
      ? {
          address,
          abi: erc721MinimalAbi,
          functionName: "balanceOf" as const,
          args: [PROBE_HOLDER] as const,
        }
      : {
          address,
          abi: erc1155MinimalAbi,
          functionName: "balanceOf" as const,
          args: [PROBE_HOLDER, 0n] as const,
        };

  let entries: MulticallEntry[];

  try {
    entries = (await client.multicall({
      allowFailure: true,
      contracts: [
        { address, abi: erc20MarkerAbi, functionName: "decimals" },
        {
          address,
          abi: erc20MarkerAbi,
          functionName: "allowance",
          args: [PROBE_HOLDER, PROBE_HOLDER],
        },
        balanceProbe,
        {
          address,
          abi: erc721MinimalAbi,
          functionName: "ownerOf" as const,
          args: [1n] as const,
        },
      ],
    })) as MulticallEntry[];
  } catch {
    return { ok: false, reason: "read_failed" };
  }

  const [decimals, allowance, balance, ownerOf] = entries;

  if (decoded(decimals) || decoded(allowance)) {
    return { ok: false, reason: "looks_like_token" };
  }

  // Must decode, not merely not-revert: a contract with no fallback reverts on
  // every unknown selector, and a group whose balance reads fail matches nobody.
  if (!decoded(balance)) {
    return { ok: false, reason: "missing_interface" };
  }

  // ERC-1155's two-argument balanceOf is not a selector an ERC-20 answers.
  // ERC-721 shares its one-argument form, so it must also expose ownerOf: empty
  // returndata proves absence, a revert only means the probe id is unowned.
  const present = standard === "erc1155" || !isZeroData(ownerOf);

  return present ? { ok: true } : { ok: false, reason: "missing_interface" };
}
