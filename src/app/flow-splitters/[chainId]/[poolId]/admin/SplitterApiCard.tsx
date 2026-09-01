"use client";

import { useState, useEffect, type ReactNode } from "react";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
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
  // Retries the claim of a payment that was sent but not yet counted; never
  // pays. Rendered as the refresh icon in place of the pay button.
  checkPayment: () => Promise<void>;
  // Claims a payment transaction the admin names by hand, for when the
  // stored hash was lost with the browser storage.
  claimTx: (txHash: `0x${string}`) => Promise<void>;
  hasPendingPayment: boolean;
  isUnlocking: boolean;
  unlockError: string;
  hasActiveKeys: boolean | undefined;
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

const TX_HASH_PATTERN = /0x[0-9a-fA-F]{64}/;

function SetupStep(props: {
  number: number;
  title: string;
  done: boolean;
  children?: ReactNode;
}) {
  const { number, title, done, children } = props;

  return (
    <div>
      <Stack direction="horizontal" gap={3} className="align-items-center">
        <span
          className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-semi-bold ${
            done ? "bg-success" : "bg-white text-secondary"
          }`}
          style={{ width: 28, height: 28 }}
        >
          {done ? (
            <Image
              src="/success.svg"
              alt="Done"
              width={16}
              height={16}
              style={{ filter: "brightness(0) invert(1)" }}
            />
          ) : (
            number
          )}
        </span>
        <span className="fw-semi-bold">{title}</span>
      </Stack>
      {children ? <div className="mt-2 ms-10">{children}</div> : null}
    </div>
  );
}

function ManualPaymentClaim(props: {
  disabled: boolean;
  onClaim: (txHash: `0x${string}`) => Promise<void>;
}) {
  const { disabled, onClaim } = props;

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [parseError, setParseError] = useState("");

  if (!open) {
    return (
      <Button
        variant="transparent"
        className="d-block mt-3 p-0 border-0 text-primary text-decoration-underline fw-semi-bold"
        onClick={() => setOpen(true)}
      >
        Already paid? Verify the transaction
      </Button>
    );
  }

  return (
    <Form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();

        const match = value.match(TX_HASH_PATTERN);

        if (!match) {
          setParseError(
            "That doesn't contain a transaction hash. Paste the 0x… hash or a block explorer link to it.",
          );
          return;
        }

        setParseError("");
        onClaim(match[0].toLowerCase() as `0x${string}`);
      }}
    >
      <Form.Label htmlFor="splitter-unlock-tx" className="fw-semi-bold">
        Payment transaction
      </Form.Label>
      <Stack direction="horizontal" gap={2} className="align-items-start">
        <Form.Control
          id="splitter-unlock-tx"
          type="text"
          placeholder="Transaction hash or block explorer link"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          type="submit"
          className="fw-semi-bold flex-shrink-0 rounded-4"
          disabled={disabled}
        >
          {disabled ? <Spinner size="sm" /> : "Verify payment"}
        </Button>
      </Stack>
      {parseError ? (
        <Card.Text className="text-danger small mt-1 mb-0">
          {parseError}
        </Card.Text>
      ) : null}
    </Form>
  );
}

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
    checkPayment,
    claimTx,
    hasPendingPayment,
    isUnlocking,
    unlockError,
    hasActiveKeys,
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
  const unlockRequired = isSplitterUnlockRequired(network.id);
  const unlockNeeded = unlockRequired && unlocked === false;
  // Whichever step's button is highest on screen carries the action that has
  // to happen first (wallet, then sign-in), so the steps below must not
  // render the same button again. The unlock step sits above the grant,
  // which sits above the keys step.
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

  const actionInFlight = isUnlocking || isGranting || isSaving;

  const unlockContent =
    unlocked === true ? null : unlocked === undefined ? (
      unlockStatusError ? (
        // A read that has permanently failed is not "loading". The rest of
        // the card still renders, so a visitor does not lose it to an RPC or
        // indexer problem.
        <Card.Text className="text-info mb-0">
          Couldn&apos;t check whether this pool&apos;s API writes are unlocked.
          Reload to try again.
        </Card.Text>
      ) : (
        <Spinner size="sm" />
      )
    ) : (
      <>
        {hasPendingPayment && isAdmin ? (
          <Card.Text className="text-info mb-3">
            {isUnlocking
              ? "Confirming your payment."
              : "Couldn't confirm payment at this time. Click the refresh icon to check again. Your payment isn't lost."}
          </Card.Text>
        ) : (
          <>
            <Card.Text className="text-info mb-2">
              Programmatic writes are locked until a pool admin makes a one-time
              payment of {SPLITTER_UNLOCK_PRICE_LABEL} for this pool. Reading
              the register and minting keys work without it.
            </Card.Text>
            <Card.Text className="text-info small mb-3">
              The Flow Splitter API is in beta. This one-time payment unlocks
              writes for this pool through the beta period. If pricing changes
              at graduation, beta payments count toward the new model.
            </Card.Text>
          </>
        )}
        {!isAdmin ? (
          <Card.Text className="text-info mb-0">
            A pool admin has to unlock this.
          </Card.Text>
        ) : (
          <>
            {/* Paying is a transaction plus an authenticated claim, so it
                needs the wallet on the pool's chain and a signed-in session,
                in that order. A save already in flight blocks it: a "No
                Admin" save mined first would leave the payment claimable by
                nobody. */}
            {walletActionLabel || needsSignIn ? (
              <Button
                disabled={actionInFlight}
                className="px-8 py-3 rounded-4 fw-semi-bold"
                onClick={walletActionLabel ? onPrepareWallet : onSignIn}
              >
                {walletActionLabel ?? "Sign In With Ethereum"}
              </Button>
            ) : hasPendingPayment ? (
              <Button
                variant="link"
                className="d-flex align-items-center justify-content-center bg-white rounded-circle p-0 border-0"
                style={{ width: 44, height: 44 }}
                disabled={actionInFlight}
                aria-label="Check payment again"
                onClick={checkPayment}
              >
                {isUnlocking ? (
                  <Spinner size="sm" />
                ) : (
                  <Image
                    src="/reload.svg"
                    alt="Refresh"
                    width={24}
                    height={24}
                  />
                )}
              </Button>
            ) : (
              <Button
                disabled={actionInFlight}
                className="px-8 py-3 rounded-4 fw-semi-bold"
                onClick={unlock}
              >
                {isUnlocking ? (
                  <Spinner size="sm" className="ms-2" />
                ) : (
                  `Pay ${SPLITTER_UNLOCK_PRICE_LABEL} to unlock`
                )}
              </Button>
            )}
            {unlockError ? (
              <Alert variant="danger" className="mt-3 mb-0">
                {unlockError}
              </Alert>
            ) : null}
            {!walletActionLabel && !needsSignIn ? (
              <ManualPaymentClaim disabled={actionInFlight} onClaim={claimTx} />
            ) : null}
          </>
        )}
      </>
    );

  const botContent = (
    <>
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
          target={<Image src="/copy.svg" alt="copy" width={18} height={18} />}
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
            <span className="text-success fw-semi-bold">Has admin access</span>
          ) : (
            <span className="text-danger fw-semi-bold">No admin access</span>
          )}
        </span>
      </Stack>
      {botIsAdmin === false ? (
        <>
          <Card.Text className="text-info mt-3 mb-3">
            Granting admin lets the Flow State bot update this pool&apos;s
            shares. It also lets the bot change pool settings and add or remove
            admins, including you. The Flow Splitter contract has no narrower
            permission.
          </Card.Text>
          {!isAdmin ? (
            <Card.Text className="text-info mb-0">
              A pool admin has to grant this.
            </Card.Text>
          ) : unlockCarriesWalletStep ? null : (
            // Granting is an on-chain transaction, so it needs a wallet on
            // the pool's chain and nothing else. Signing in gates the key
            // list below, not this. A save already in flight blocks it: a
            // "No Admin" save computes its revoke set now and would be mined
            // first, leaving the pool immutable with the bot holding admin.
            <Button
              disabled={actionInFlight}
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
    </>
  );

  const keysContent = !canManage ? (
    // Adminship follows from the connected address alone, so a visitor who
    // is not one is told so instead of being walked through a sign-in that
    // reveals the same thing.
    isWalletConnected && !isAdmin ? (
      <Card.Text className="text-info mb-0">
        Only this pool&apos;s admins can manage API keys.
      </Card.Text>
    ) : stepCarriedAbove ? null : (
      <Button
        className="px-8 py-3 rounded-4 fw-semi-bold"
        onClick={walletActionLabel ? onPrepareWallet : onSignIn}
      >
        {walletActionLabel ?? "Sign In With Ethereum"}
      </Button>
    )
  ) : (
    <>
      {botIsAdmin === false ? (
        <Alert variant="warning" className="mb-3">
          You can mint a key now, but writes will fail until the bot holds admin
          on this pool.
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
          // The Share Register's API-controlled notice reads a separate
          // unauthenticated endpoint, so minting the pool's first key has
          // to nudge it too.
          onKeysChanged();
        }}
      />
    </>
  );

  const steps: {
    key: string;
    title: string;
    done: boolean;
    content: ReactNode;
  }[] = [
    ...(unlockRequired
      ? [
          {
            key: "unlock",
            title: "Unlock API writes",
            done: unlocked === true,
            content: unlockContent,
          },
        ]
      : []),
    {
      key: "bot",
      title: "Bot admin access",
      done: botIsAdmin === true,
      content: botContent,
    },
    {
      key: "keys",
      title: "API keys",
      done: !!hasActiveKeys,
      content: keysContent,
    },
  ];

  return (
    <Card className="bg-lace-100 rounded-4 border-0 mt-8 px-10 py-8">
      <Card.Header className="d-flex gap-1 mb-3 bg-transparent border-0 rounded-4 p-0 fs-6 text-secondary fw-semi-bold">
        Automated Updates (Beta)
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
              Set an (offchain) external system to programmatically update this
              Flow Splitter&apos;s share register via API.
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
                {steps.map((step, index) => (
                  <SetupStep
                    key={step.key}
                    number={index + 1}
                    title={step.title}
                    done={step.done}
                  >
                    {step.content}
                  </SetupStep>
                ))}
                {canManage ? (
                  <SplitterWriteHistory network={network} poolId={poolId} />
                ) : null}
              </>
            )}

            <hr className="my-0" />

            <div>
              <span className="fw-semi-bold d-block mb-2 text-secondary">
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
