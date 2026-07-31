import { db } from "../db";
import type { RegisterEntry } from "./plan";

/**
 * Record the addresses a batch is about to write.
 *
 * Called per batch, and before the batch is broadcast rather than after its
 * receipt: an address this write introduces has to be recorded or it can be
 * orphaned, and the receipt wait is the longest window in which the runner can
 * be killed. If one write adds an address and the next drops it before the
 * indexer catches up, the address is in neither the indexer's list nor the new
 * payload, so nothing would ever zero it and it would keep receiving flow
 * forever.
 *
 * Recording a batch that then never lands is the harmless direction: only the
 * addresses are ever read back, units always come from the chain, and
 * `pruneMirror` drops whatever settles at zero.
 */
export async function recordWrittenBatch(
  chainId: number,
  poolId: string,
  entries: RegisterEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await db
    .insertInto("splitterWrittenRegister")
    .values(
      entries.map((entry) => ({
        chainId,
        poolId,
        address: entry.address.toLowerCase(),
        units: entry.units.toString(),
        updatedAt: new Date(),
      })),
    )
    .onConflict((oc) =>
      oc.columns(["chainId", "poolId", "address"]).doUpdateSet((eb) => ({
        units: eb.ref("excluded.units"),
        updatedAt: eb.ref("excluded.updatedAt"),
      })),
    )
    .execute();
}

/**
 * Drop addresses that are confirmed at zero in both the chain and the indexer,
 * so the mirror does not grow without bound. Anything still held by either
 * source stays, because the mirror's whole job is to name addresses the other
 * two might miss.
 */
export async function pruneMirror(
  chainId: number,
  poolId: string,
  confirmedZero: string[],
): Promise<void> {
  if (confirmedZero.length === 0) return;

  await db
    .deleteFrom("splitterWrittenRegister")
    .where("chainId", "=", chainId)
    .where("poolId", "=", poolId)
    .where(
      "address",
      "in",
      confirmedZero.map((a) => a.toLowerCase()),
    )
    .execute();
}
