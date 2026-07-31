// The refusal messages the API returns. UI copy for the same conditions lives
// with the UI, which says "shares" where the contract and the API say "units".
export const IMMUTABLE_POOL_ERROR =
  "This pool has no admins and is permanently immutable, so it cannot be API-driven";

export const TRANSFERABLE_POOL_ERROR =
  "The API does not support pools with transferable units, because recipients can move units between writes";

export type ApiIneligibility = "immutable" | "transferable";

export const API_INELIGIBILITY_ERRORS: Record<ApiIneligibility, string> = {
  immutable: IMMUTABLE_POOL_ERROR,
  transferable: TRANSFERABLE_POOL_ERROR,
};

export type ApiEligibility =
  | { status: "available" }
  | { status: "unknown" }
  | { status: "unavailable"; reason: ApiIneligibility };

/**
 * One predicate for both the API routes that refuse a pool and the admin page
 * that hides the API section, so the two can never disagree about which pools
 * are eligible. It returns a reason code rather than a message, because each
 * surface words it for its own audience.
 *
 * Both inputs are undefined until their reads resolve, and stay undefined if a
 * read fails. Neither is collapsed to a definite answer: a transferable pool is
 * refused by every API surface, so treating "don't know" as "fine" would invite
 * an admin to grant the bot full pool admin for an integration that can never
 * work, and an unread admin list reported as "no admins" tells an admin their
 * mutable pool is permanently immutable.
 */
export function getApiEligibility(params: {
  hasAdmins: boolean | undefined;
  transferableUnits: boolean | undefined;
}): ApiEligibility {
  if (params.hasAdmins === undefined) {
    return { status: "unknown" };
  }

  if (!params.hasAdmins) {
    return { status: "unavailable", reason: "immutable" };
  }

  if (params.transferableUnits === undefined) {
    return { status: "unknown" };
  }

  if (params.transferableUnits) {
    return { status: "unavailable", reason: "transferable" };
  }

  return { status: "available" };
}
