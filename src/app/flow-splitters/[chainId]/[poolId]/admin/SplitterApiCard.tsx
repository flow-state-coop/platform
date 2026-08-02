"use client";

import { useState, useEffect } from "react";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import CopyTooltip from "@/components/CopyTooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import {
  getApiEligibility,
  type ApiIneligibility,
} from "@/lib/splitterEligibility";
import {
  SPLITTER_UNLOCK_PRICE_LABEL,
  isSplitterUnlockRequired,
} from "@/lib/splitterUnlock";
import { truncateStr } from "@/lib/utils";
import type { Network } from "@/types/network";
import MintedKeyAlert from "./MintedKeyAlert";
import SplitterApiKeysPanel from "./SplitterApiKeysPanel";
import SplitterWriteHistory from "./SplitterWriteHistory";
import type { SplitterApiKey } from "./useSplitterApiKeys";

type SplitterApiCardProps = {
  network: Network;
  poolId: string;
  isAdmin: boolean;
  hasAdmins: boolean | undefined;
  hasAdminsError: boolean;
  transferableUnits: boolean | undefined;
  transferabilityError: boolean;
  isWalletConnected: boolean;
  needsSignIn: boolean;
  // Null once the wallet is connected on the pool's chain; otherwise the step
  // that has to happen first.
  walletActionLabel: string | null;
  onPrepareWallet: () => void;
  onSignIn: () => void;
  // The bot's status and the grant both live on the page, not here: the two
  // transactions go out from the same wallet at consecutive nonces, so each
  // button has to be able to disable itself while the other is in flight.
  botIsAdmin: boolean | undefined;
  botStatusError: boolean;
  grant: () => Promise<void>;
  isGranting: boolean;
  isSaving: boolean;
  grantError: string;
  unlocked: boolean | undefined;
  unlockStatusError: boolean;
  unlock: () => Promise<void>;
  isUnlocking: boolean;
  unlockError: string;
  keys: SplitterApiKey[];
  keysLoading: boolean;
  keysError: string;
  reloadKeys: () => Promise<void>;
  onKeysChanged: () => void;
};

// This page says shares everywhere; the API and the contract say units.
const INELIGIBLE_COPY: Record<ApiIneligibility, string> = {
  immutable:
    "This pool has no admins and is permanently immutable, so it cannot be API-driven.",
  transferable:
    "The API does not support pools with transferable shares, because recipients can move shares between writes.",
};

export default function SplitterApiCard(props: SplitterApiCardProps) {
  const {
    network,
    poolId,
    isAdmin,
    hasAdmins,
    hasAdminsError,
    transferableUnits,
    transferabilityError,
    isWalletConnected,
    needsSignIn,
    walletActionLabel,
    onPrepareWallet,
    onSignIn,
    botIsAdmin,
    botStatusError,
    grant,
    isGranting,
    isSaving,
    grantError,
    unlocked,
    unlockStatusError,
    unlock,
    isUnlocking,
    unlockError,
    keys,
    keysLoading,
    keysError,
    reloadKeys,
    onKeysChanged,
  } = props;

  const [origin, setOrigin] = useState("");
  // Held here rather than in the keys panel: the token is shown once, and the
  // panel unmounts on any of the reads that gate it (a subgraph poll that comes
  // back empty, a session that lapses), which would take a key nobody has
  // copied yet with it.
  const [mintedToken, setMintedToken] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const eligibility = getApiEligibility({ hasAdmins, transferableUnits });

  const canManage = !needsSignIn && isAdmin;
  const unlockNeeded =
    isSplitterUnlockRequired(network.id) && unlocked === false;
  // Whichever section's button is highest on screen carries the step that has
  // to happen first (wallet, then sign-in), so the sections below must not
  // render the same button again. The unlock section sits above the grant,
  // which sits above the keys heading.
  const unlockCarriesWalletStep =
    !!walletActionLabel && isAdmin && unlockNeeded;
  const unlockCarriesSignInStep =
    !walletActionLabel && needsSignIn && isAdmin && unlockNeeded;
  const grantCarriesWalletStep =
    !unlockCarriesWalletStep &&
    !!walletActionLabel &&
    isAdmin &&
    botIsAdmin === false;
  const stepCarriedAbove =
    unlockCarriesWalletStep ||
    unlockCarriesSignInStep ||
    grantCarriesWalletStep;

  return (
    <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
      <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
        API
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
              Let an external system replace this pool&apos;s share register
              programmatically. The Flow State bot signs the transactions, so it
              must hold admin on this pool.
            </p>
          }
        />
      </Card.Header>
      <Card.Body className="p-0">
        <MintedKeyAlert
          token={mintedToken}
          onDismiss={() => setMintedToken("")}
        />
        {eligibility.status === "unavailable" ? (
          <Card.Text className="text-info mb-0">
            {INELIGIBLE_COPY[eligibility.reason]}
          </Card.Text>
        ) : (
          <Stack direction="vertical" gap={6}>
            {eligibility.status === "unknown" ? (
              hasAdminsError || transferabilityError ? (
                // A read that has permanently failed is not "loading". The
                // endpoint reference below still renders, so a visitor does not
                // lose it to an RPC or indexer problem.
                <Card.Text className="text-info mb-0">
                  Couldn&apos;t check whether this pool can be API-driven, so
                  the API section is unavailable. Reload to try again.
                </Card.Text>
              ) : (
                <Stack
                  direction="horizontal"
                  className="justify-content-center py-3"
                >
                  <Spinner size="sm" />
                </Stack>
              )
            ) : (
              <>
                {unlockNeeded ? (
                  <div>
                    <span className="fw-semi-bold d-block mb-2">
                      Unlock API writes
                    </span>
                    <Card.Text className="text-info mb-3">
                      Programmatic writes are locked until a pool admin makes a
                      one-time payment of {SPLITTER_UNLOCK_PRICE_LABEL} for this
                      pool. Reading the register and minting keys work without
                      it.
                    </Card.Text>
                    {!isAdmin ? (
                      <Card.Text className="text-info mb-0">
                        A pool admin has to unlock this.
                      </Card.Text>
                    ) : (
                      // Paying is a transaction plus an authenticated claim,
                      // so it needs the wallet on the pool's chain and a
                      // signed-in session, in that order. A save already in
                      // flight blocks it: a "No Admin" save mined first would
                      // leave the payment claimable by nobody.
                      <Button
                        disabled={isUnlocking || isGranting || isSaving}
                        className="px-8 py-3 rounded-4 fw-semi-bold"
                        onClick={
                          walletActionLabel
                            ? onPrepareWallet
                            : needsSignIn
                              ? onSignIn
                              : unlock
                        }
                      >
                        {isUnlocking ? (
                          <Spinner size="sm" className="ms-2" />
                        ) : (
                          (walletActionLabel ??
                          (needsSignIn
                            ? "Sign In With Ethereum"
                            : `Pay ${SPLITTER_UNLOCK_PRICE_LABEL} to unlock`))
                        )}
                      </Button>
                    )}
                    {unlockError ? (
                      <Alert variant="danger" className="mt-3 mb-0">
                        {unlockError}
                      </Alert>
                    ) : null}
                  </div>
                ) : unlocked === undefined &&
                  unlockStatusError &&
                  isSplitterUnlockRequired(network.id) ? (
                  <Card.Text className="text-info mb-0">
                    Couldn&apos;t check whether this pool&apos;s API writes are
                    unlocked. Reload to try again.
                  </Card.Text>
                ) : null}
                <div>
                  <span className="fw-semi-bold d-block mb-2">
                    Flow State automation bot
                  </span>
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-center flex-wrap"
                  >
                    <a
                      href={`${network.blockExplorer}/address/${FLOW_STATE_BOT_ADDRESS}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code className="bg-white rounded-4 p-2">
                        {truncateStr(FLOW_STATE_BOT_ADDRESS, 14)}
                      </code>
                    </a>
                    <CopyTooltip
                      contentClick="Copied"
                      contentHover="Copy address"
                      target={
                        <Image
                          src="/copy.svg"
                          alt="copy"
                          width={18}
                          height={18}
                        />
                      }
                      handleCopy={() =>
                        navigator.clipboard.writeText(FLOW_STATE_BOT_ADDRESS)
                      }
                    />
                    <span className="ms-2">
                      {botStatusError ? (
                        <span className="text-info fw-semi-bold">
                          Couldn&apos;t check admin access
                        </span>
                      ) : botIsAdmin === undefined ? (
                        <Spinner size="sm" />
                      ) : botIsAdmin ? (
                        <span className="text-success fw-semi-bold">
                          Has admin access
                        </span>
                      ) : (
                        <span className="text-danger fw-semi-bold">
                          No admin access
                        </span>
                      )}
                    </span>
                  </Stack>
                  {botIsAdmin === false ? (
                    <>
                      <Card.Text className="text-info mt-3 mb-3">
                        Granting admin lets the Flow State bot update this
                        pool&apos;s shares. It also lets the bot change pool
                        settings and add or remove admins, including you. The
                        Flow Splitter contract has no narrower permission.
                      </Card.Text>
                      {!isAdmin ? (
                        <Card.Text className="text-info mb-0">
                          A pool admin has to grant this.
                        </Card.Text>
                      ) : unlockCarriesWalletStep ? null : (
                        // Granting is an on-chain transaction, so it needs a
                        // wallet on the pool's chain and nothing else. Signing
                        // in gates the key list below, not this. A save already
                        // in flight blocks it: a "No Admin" save computes its
                        // revoke set now and would be mined first, leaving the
                        // pool immutable with the bot holding admin.
                        <Button
                          disabled={isGranting || isUnlocking || isSaving}
                          className="px-8 py-3 rounded-4 fw-semi-bold"
                          onClick={walletActionLabel ? onPrepareWallet : grant}
                        >
                          {isGranting ? (
                            <Spinner size="sm" className="ms-2" />
                          ) : (
                            (walletActionLabel ?? "Grant admin access")
                          )}
                        </Button>
                      )}
                      {grantError ? (
                        <Alert variant="danger" className="mt-3 mb-0">
                          {grantError}
                        </Alert>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {!canManage ? (
                  stepCarriedAbove ? null : (
                    <div>
                      <span className="fw-semi-bold d-block mb-2">
                        API keys
                      </span>
                      {/* Adminship follows from the connected address alone,
                          so a visitor who is not one is told so instead of
                          being walked through a sign-in that reveals the same
                          thing. */}
                      {isWalletConnected && !isAdmin ? (
                        <Card.Text className="text-info mb-0">
                          Only this pool&apos;s admins can manage API keys.
                        </Card.Text>
                      ) : (
                        <Button
                          className="px-8 py-3 rounded-4 fw-semi-bold"
                          onClick={
                            walletActionLabel ? onPrepareWallet : onSignIn
                          }
                        >
                          {walletActionLabel ?? "Sign In With Ethereum"}
                        </Button>
                      )}
                    </div>
                  )
                ) : (
                  <>
                    <div>
                      {botIsAdmin === false ? (
                        <Alert variant="warning" className="mb-3">
                          You can mint a key now, but writes will fail until the
                          bot holds admin on this pool.
                        </Alert>
                      ) : null}
                      <SplitterApiKeysPanel
                        chainId={network.id}
                        poolId={poolId}
                        keys={keys}
                        loading={keysLoading}
                        loadError={keysError}
                        onMinted={setMintedToken}
                        reload={async () => {
                          await reloadKeys();
                          // The Share Register's API-controlled notice reads a
                          // separate unauthenticated endpoint, so minting the
                          // pool's first key has to nudge it too.
                          onKeysChanged();
                        }}
                      />
                    </div>
                    <SplitterWriteHistory network={network} poolId={poolId} />
                  </>
                )}
              </>
            )}

            <div>
              <span className="fw-semi-bold d-block mb-2">
                Build an integration
              </span>
              <p className="text-info mb-2">
                POST relative weights for this pool. The API normalizes them to
                at most 1,000,000 shares, so each recipient&apos;s share reads
                as parts per million and the caller stays stateless about the
                register.
              </p>
              <pre className="bg-white rounded-4 p-3 mb-2 text-break overflow-auto">
                <code>{`POST ${origin}/api/flow-splitter/allocation
Authorization: Bearer <your-key>
Content-Type: application/json

{
  "recipients": [
    { "address": "0xRecipientAddress", "weight": 40 },
    { "address": "0xRecipientAddress", "weight": 60 }
  ]
}`}</code>
              </pre>
              <ul className="text-info mb-0">
                <li>
                  <span className="fw-semi-bold">weight</span> is relative and ≥
                  0 (at least one must be &gt; 0). 1 to 1,000 entries, no
                  duplicates.
                </li>
                <li>
                  The list is the complete register: any current recipient
                  missing from it is set to zero shares.
                </li>
                <li>
                  Writes are asynchronous. A <code>202</code> carries a{" "}
                  <code>jobId</code> to poll at{" "}
                  <code>GET /api/flow-splitter/jobs/{"{jobId}"}</code>.
                </li>
                <li>
                  Read the current register with{" "}
                  <code>GET /api/flow-splitter/allocation</code>, using the same
                  key.
                </li>
                <li>
                  Limits: one write in flight per pool, one write every 60
                  seconds, 60 requests a minute per key, 10 active keys.
                </li>
              </ul>
              <p className="text-info mt-2 mb-0">
                Full reference:{" "}
                <a
                  href="https://docs.flowstate.network/developers/splitter-api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Flow Splitter API docs
                </a>
                .
              </p>
            </div>
          </Stack>
        )}
      </Card.Body>
    </Card>
  );
}
