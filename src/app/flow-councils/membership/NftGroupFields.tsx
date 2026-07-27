import { useState, useEffect, useRef } from "react";
import Form from "react-bootstrap/Form";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import { isAddress } from "viem";
import type { NftTokenStandard } from "./voterTableTypes";

export type NftConfigDraft = {
  contractAddress: string;
  tokenStandard: NftTokenStandard | "";
  tokenId: string;
  acquisitionUrl: string;
  collectionName: string;
};

export const emptyNftDraft: NftConfigDraft = {
  contractAddress: "",
  tokenStandard: "",
  tokenId: "",
  acquisitionUrl: "",
  collectionName: "",
};

export function nftDraftFromGroup(group: {
  nftContractAddress?: string | null;
  nftTokenStandard?: NftTokenStandard | null;
  nftTokenId?: string | null;
  nftAcquisitionUrl?: string | null;
  nftCollectionName?: string | null;
}): NftConfigDraft {
  return {
    contractAddress: group.nftContractAddress ?? "",
    tokenStandard: group.nftTokenStandard ?? "",
    tokenId: group.nftTokenId ?? "",
    acquisitionUrl: group.nftAcquisitionUrl ?? "",
    collectionName: group.nftCollectionName ?? "",
  };
}

type ProbeResult = {
  status: string;
  standard?: NftTokenStandard;
  collectionName?: string;
  message: string;
  overrideOk?: boolean;
  overrideReason?: string;
};

const OVERRIDABLE_STATUSES = ["no_erc165", "unsupported_interface"];

export function nftDraftToConfig(draft: NftConfigDraft) {
  if (!draft.tokenStandard) {
    return null;
  }

  return {
    contractAddress: draft.contractAddress.trim(),
    tokenStandard: draft.tokenStandard,
    ...(draft.tokenStandard === "erc1155"
      ? { tokenId: draft.tokenId.trim() }
      : {}),
    ...(draft.acquisitionUrl.trim()
      ? { acquisitionUrl: draft.acquisitionUrl.trim() }
      : {}),
    ...(draft.collectionName ? { collectionName: draft.collectionName } : {}),
  };
}

export function isNftDraftComplete(draft: NftConfigDraft): boolean {
  if (!isAddress(draft.contractAddress.trim()) || !draft.tokenStandard) {
    return false;
  }

  return draft.tokenStandard === "erc1155"
    ? /^(0|[1-9]\d*)$/.test(draft.tokenId.trim())
    : true;
}

export default function NftGroupFields({
  chainId,
  councilId,
  draft,
  onChange,
  onCollectionDetected,
  onBlockedChange,
  disabled,
}: {
  chainId: number;
  councilId: string;
  draft: NftConfigDraft;
  onChange: (updater: (current: NftConfigDraft) => NftConfigDraft) => void;
  onCollectionDetected?: (collectionName: string, address: string) => void;
  onBlockedChange?: (blocked: boolean) => void;
  disabled?: boolean;
}) {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [overrideCheck, setOverrideCheck] = useState<ProbeResult | null>(null);
  const [checking, setChecking] = useState(false);
  // A prefilled address is treated as already probed so reopening the editor
  // can't wipe a standard that was set through the manual override.
  const probedAddressRef = useRef(draft.contractAddress.trim());

  const address = draft.contractAddress.trim();
  const standard = draft.tokenStandard;

  useEffect(() => {
    if (!isAddress(address)) {
      setProbe(null);
      setOverrideCheck(null);
      probedAddressRef.current = "";
      return;
    }

    if (probedAddressRef.current !== address) {
      setProbe(null);
      setOverrideCheck(null);
    }

    let cancelled = false;
    setChecking(true);

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/flow-council/voter-groups/nft-probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            councilId,
            contractAddress: address,
          }),
        });
        const data: ProbeResult = await res.json();

        if (cancelled) {
          return;
        }

        setProbe(data);

        // A new address is re-probed from scratch, so a manual override never
        // carries over from the previous one.
        if (probedAddressRef.current !== address) {
          probedAddressRef.current = address;
          const detectedStandard = data.standard;

          if (detectedStandard) {
            onChange((current) => ({
              ...current,
              tokenStandard: detectedStandard,
              collectionName: data.collectionName ?? "",
            }));
            onCollectionDetected?.(data.collectionName ?? "", address);
          } else {
            onChange((current) => ({
              ...current,
              tokenStandard: "",
              collectionName: "",
            }));
          }
        }
      } catch {
        if (!cancelled) {
          setProbe(null);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // The callbacks are intentionally not dependencies: their identity changes
    // on every parent render, and re-probing that often would spam the RPC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, councilId]);

  const needsManualStandard =
    !!probe && OVERRIDABLE_STATUSES.includes(probe.status);

  useEffect(() => {
    if (
      !needsManualStandard ||
      !standard ||
      !isAddress(address) ||
      probedAddressRef.current !== address
    ) {
      setOverrideCheck(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/flow-council/voter-groups/nft-probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            councilId,
            contractAddress: address,
            overrideStandard: standard,
          }),
        });
        const data: ProbeResult = await res.json();

        if (!cancelled) {
          setOverrideCheck(data);
        }
      } catch {
        if (!cancelled) {
          setOverrideCheck(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsManualStandard, standard, address, chainId, councilId]);

  // A conclusive rejection blocks submission outright; an inconclusive one only
  // blocks until a manual standard clears the override probe.
  const blocked =
    (!!probe && probe.status !== "detected" && !needsManualStandard) ||
    overrideCheck?.overrideOk === false;

  useEffect(() => {
    onBlockedChange?.(blocked);
    // onBlockedChange identity is the caller's concern; reacting to it would
    // loop on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  return (
    <Stack direction="vertical" gap={3}>
      <Form.Group>
        <Form.Label className="fw-semi-bold">Collection address</Form.Label>
        <Form.Control
          type="text"
          placeholder="0x..."
          value={draft.contractAddress}
          disabled={disabled}
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              contractAddress: e.target.value,
            }))
          }
        />
        {checking ? (
          <Form.Text className="text-info">
            <Spinner size="sm" className="me-2" />
            Checking the contract...
          </Form.Text>
        ) : null}
        {!checking && probe?.status === "detected" ? (
          <Form.Text className="text-success">{probe.message}</Form.Text>
        ) : null}
      </Form.Group>

      {!checking && probe && probe.status !== "detected" ? (
        <Alert
          variant={needsManualStandard ? "warning" : "danger"}
          className="mb-0"
        >
          {probe.message}
        </Alert>
      ) : null}

      {needsManualStandard ? (
        <Form.Group>
          <Form.Label className="fw-semi-bold">Token standard</Form.Label>
          <Form.Select
            value={standard}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                tokenStandard: e.target.value as NftTokenStandard | "",
                tokenId: "",
              }))
            }
          >
            <option value="">Select a standard</option>
            <option value="erc721">ERC-721</option>
            <option value="erc1155">ERC-1155</option>
          </Form.Select>
        </Form.Group>
      ) : null}

      {overrideCheck && overrideCheck.overrideOk === false ? (
        <Alert variant="danger" className="mb-0">
          {overrideCheck.message}
        </Alert>
      ) : null}

      {standard === "erc1155" ? (
        <Form.Group>
          <Form.Label className="fw-semi-bold">Token ID</Form.Label>
          <Form.Control
            type="text"
            placeholder="0"
            value={draft.tokenId}
            disabled={disabled}
            onChange={(e) =>
              onChange((current) => ({ ...current, tokenId: e.target.value }))
            }
          />
        </Form.Group>
      ) : null}

      <Form.Group>
        <Form.Label className="fw-semi-bold">
          Where to get this NFT (optional)
        </Form.Label>
        <Form.Control
          type="text"
          placeholder="https://"
          value={draft.acquisitionUrl}
          disabled={disabled}
          onChange={(e) =>
            onChange((current) => ({
              ...current,
              acquisitionUrl: e.target.value,
            }))
          }
        />
      </Form.Group>
    </Stack>
  );
}
