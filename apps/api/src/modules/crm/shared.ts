import type { Tenant } from "../tenancy";
import { ProblemException } from "../../platform";

/** A tenant that names a client account, which every CRM route has. */
export type AccountTenant = Tenant & { accountId: string };

/** Turns "one more row than asked for" into a page and the cursor for the next one. */
export function toPage<Row extends { id: string }, T>(rows: Row[], limit: number, map: (row: Row) => T) {
  const items = rows.slice(0, limit);
  return { items: items.map(map), nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** True for PostgreSQL's "that already exists" error, wherever the driver wrapped it. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === "23505") return true;
  }
  return false;
}

/** The constraint a PostgreSQL error names, if any. */
export function constraintOf(error: unknown): string | undefined {
  for (let e = error as { constraint?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (typeof e.constraint === "string") return e.constraint;
  }
  return undefined;
}

export const notFound = () => new ProblemException(404, "not_found", "Not Found");
