import { schema } from "@aashi/db";
import { v7 as uuidv7 } from "uuid";
import type { Tx } from "./database.service";

/**
 * Records an event in the same transaction as the change it describes, so the
 * two succeed or fail together. A relay will publish these later.
 */
export async function recordEvent(
  tx: Tx,
  event: { agencyId: string; accountId?: string; type: string; payload: Record<string, unknown> },
): Promise<void> {
  await tx.insert(schema.outbox).values({
    id: uuidv7(),
    agencyId: event.agencyId,
    accountId: event.accountId ?? null,
    eventType: event.type,
    payload: event.payload,
  });
}
