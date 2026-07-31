import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

type AdminEntry = { address: string; validationError: string };

/**
 * Whether saving would drop the bot from the admin set.
 *
 * `updatePool` revokes only the accounts it is handed, so the bot survives
 * unless a row is explicitly deleted. That makes this a form-vs-chain diff, not
 * a "did anything change" check.
 */
export function isRemovingBotAdmin(params: {
  indexedAdmins: string[];
  adminsEntry: AdminEntry[];
  immutable: boolean;
}): boolean {
  const bot = FLOW_STATE_BOT_ADDRESS.toLowerCase();

  const botHoldsAdmin = params.indexedAdmins.some(
    (adminAddress) => adminAddress.toLowerCase() === bot,
  );

  // The immutable path revokes everyone, which its own warning covers.
  if (!botHoldsAdmin || params.immutable) {
    return false;
  }

  return !params.adminsEntry.some(
    (adminEntry) =>
      adminEntry.validationError === "" &&
      adminEntry.address.toLowerCase() === bot,
  );
}

/**
 * The warnings an explicit confirm has to show before a save.
 *
 * `botIsAdmin` and `hasActiveKeys` are undefined while their reads are in
 * flight and if those reads fail, and an unresolved read counts as "warn": the
 * save path re-reads the same fact from the chain and would revoke the bot, so
 * defaulting to silence would let the gate and the action disagree.
 */
export function getConfirmWarnings(params: {
  immutable: boolean;
  botIsAdmin: boolean | undefined;
  hasActiveKeys: boolean | undefined;
  removingBotAdmin: boolean;
}): string[] {
  const warnings: string[] = [];

  if (params.immutable && params.botIsAdmin !== false) {
    warnings.push(
      "This revokes every admin, including the Flow State bot if it holds admin. API writes to this pool stop permanently and cannot be re-enabled.",
    );
  } else if (params.immutable && params.hasActiveKeys !== false) {
    warnings.push(
      "This revokes every admin. Any API keys on this pool stop working permanently once it is immutable.",
    );
  }

  if (params.removingBotAdmin) {
    warnings.push(
      "This removes the Flow State bot from the admin list. API writes to this pool will fail until it is granted admin again.",
    );
  }

  return warnings;
}
