import { z } from "zod";
import { isAddress, zeroAddress } from "viem";

// Matches the council metrics API, and the body cap that goes with it.
export const MAX_ALLOCATION_ENTRIES = 1000;

export const splitterQuerySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  // Canonicalized, because the pool id is a storage key here but a uint256
  // everywhere on-chain. Without this "32", "032" and "0032" authorize against
  // the same pool while keying three different sets of rows, which would
  // multiply the active-key cap, the write interval and the in-flight check,
  // and split the written-register mirror so an address added under one
  // spelling is invisible to a write under another.
  poolId: z
    .string()
    .regex(/^\d{1,78}$/, "Invalid pool ID")
    .transform((value) => BigInt(value).toString()),
});

export const splitterKeyCreateSchema = z.object({
  label: z.string().min(1).max(100),
});

/**
 * Weights are arbitrary positive numbers (scores, revenue, points) and do not
 * have to sum to anything; normalization happens after validation.
 *
 * Everything rejected here is a deterministic caller fault, which is what
 * separates a cooled-down key from a platform failure. The zero address and the
 * pool's own address revert on-chain, and duplicates are silently accepted by
 * the contract with the last one winning, so validation is the only guard.
 */
export const splitterAllocationSchema = z.object({
  recipients: z
    .array(
      z.object({
        address: z
          .string()
          // Not strict: viem's default rejects any mixed-case address whose
          // EIP-55 checksum does not match, so an integrator storing addresses
          // upper-cased would be refused for formatting and cooled down for it.
          .refine(
            (a) => isAddress(a, { strict: false }),
            "Invalid recipient address",
          )
          .refine(
            (a) => a.toLowerCase() !== zeroAddress,
            "The zero address cannot be a recipient",
          ),
        weight: z.number().finite().nonnegative(),
      }),
    )
    .min(1, "At least one recipient is required")
    .max(
      MAX_ALLOCATION_ENTRIES,
      `At most ${MAX_ALLOCATION_ENTRIES} recipients per request`,
    )
    .refine((r) => r.some((entry) => entry.weight > 0), {
      message:
        "At least one recipient must have a positive weight. Emptying a register must be deliberate",
    })
    .refine(
      (r) =>
        new Set(r.map((entry) => entry.address.toLowerCase())).size ===
        r.length,
      { message: "Duplicate recipient addresses are not allowed" },
    ),
});

export type AllocationPayload = z.infer<typeof splitterAllocationSchema>;
