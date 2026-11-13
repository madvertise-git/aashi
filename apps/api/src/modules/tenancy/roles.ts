import type { Role } from "@aashi/contracts";
import { ProblemException } from "../../platform";
import type { Tenant } from "./tenant.guard";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

/**
 * Stops the request unless the user holds at least this role in the agency.
 * This is "forbidden", not "not found": they are a member, so the agency's
 * existence is no secret from them.
 */
export function requireRole(tenant: Tenant, atLeast: Role): void {
  if (RANK[tenant.role] < RANK[atLeast]) {
    throw new ProblemException(403, "forbidden", `Only an agency ${atLeast === "owner" ? "owner" : "admin or owner"} can do that.`);
  }
}
