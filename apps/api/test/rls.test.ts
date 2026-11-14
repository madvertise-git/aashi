// Proves the wall is in the database itself: these tests skip the API's checks
// and talk to PostgreSQL directly as the everyday role.
import type { INestApplication } from "@nestjs/common";
import { tablesWithoutForcedRls } from "@aashi/db";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, startApp, type TenantFixture } from "./helpers";

const TABLES = ["users", "agencies", "memberships", "accounts", "contacts"];

let app: INestApplication;
let pool: pg.Pool;
let a: TenantFixture;
let b: TenantFixture;

/** Runs `fn` in a transaction with the given context, as the API would. */
async function withContext<T>(
  ctx: { userId?: string; agencyId?: string; accountId?: string },
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.agency_id', $2, true), set_config('app.account_id', $3, true)",
      [ctx.userId ?? "", ctx.agencyId ?? "", ctx.accountId ?? ""],
    );
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

const count = async (client: pg.PoolClient, table: string) =>
  Number((await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

beforeAll(async () => {
  app = await startApp();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  a = await createTenant(app, "A");
  b = await createTenant(app, "B");
});
afterAll(async () => {
  await pool.end();
  await app.close();
});

describe("row-level security", () => {
  it("is enabled and forced on every table", async () => {
    expect(await tablesWithoutForcedRls(process.env.DATABASE_URL!)).toEqual([]);
  });

  it("the everyday role cannot bypass it", async () => {
    const { rows } = await pool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it.each(TABLES)("a query with no context sees nothing in %s", async (table) => {
    expect(await withContext({}, (c) => count(c, table))).toBe(0);
  });

  it.each(["sessions", "auth_credentials", "auth_verifications", "auth_two_factors"])(
    "the everyday role cannot read the sign-in table %s",
    async (table) => {
      await expect(withContext({ userId: a.agency.id }, (c) => count(c, table))).rejects.toThrow(/permission denied/);
    },
  );

  it("the sign-in engine's role cannot bypass row-level security or reach customer data", async () => {
    const auth = new pg.Pool({ connectionString: process.env.AUTH_DATABASE_URL, max: 1 });
    try {
      const { rows } = await auth.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
      expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      for (const table of ["agencies", "memberships", "accounts", "contacts", "outbox"]) {
        await expect(auth.query(`SELECT count(*) FROM ${table}`)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await auth.end();
    }
  });

  it("the outbox cannot be read by the everyday role at all", async () => {
    await expect(withContext({ agencyId: a.agency.id }, (c) => count(c, "outbox"))).rejects.toThrow(/permission denied/);
  });

  it("a forgotten filter returns only the current customer's rows", async () => {
    const ctx = { agencyId: a.agency.id, accountId: a.account.id };
    await withContext(ctx, async (c) => {
      expect((await c.query("SELECT id FROM accounts")).rows).toEqual([{ id: a.account.id }]);
      expect((await c.query("SELECT id FROM contacts")).rows).toEqual([{ id: a.contact.id }]);
      expect((await c.query("SELECT id FROM agencies")).rows).toEqual([{ id: a.agency.id }]);
    });
  });

  it("contacts need the client account as well as the agency", async () => {
    expect(await withContext({ agencyId: a.agency.id }, (c) => count(c, "contacts"))).toBe(0);
    // The right agency with another agency's account also sees nothing.
    expect(await withContext({ agencyId: a.agency.id, accountId: b.account.id }, (c) => count(c, "contacts"))).toBe(0);
  });

  it("agency A cannot write into agency B", async () => {
    const ctx = { agencyId: a.agency.id, accountId: a.account.id };
    await expect(
      withContext(ctx, (c) =>
        c.query("INSERT INTO contacts (id, agency_id, account_id, first_name) VALUES (gen_random_uuid(), $1, $2, 'x')", [
          b.agency.id,
          b.account.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withContext(ctx, (c) =>
        c.query("INSERT INTO accounts (id, agency_id, name) VALUES (gen_random_uuid(), $1, 'x')", [b.agency.id]),
      ),
    ).rejects.toThrow(/row-level security/);
    await withContext(ctx, async (c) => {
      expect((await c.query("UPDATE contacts SET first_name = 'hacked' WHERE id = $1", [b.contact.id])).rowCount).toBe(0);
      expect((await c.query("DELETE FROM contacts WHERE id = $1", [b.contact.id])).rowCount).toBe(0);
      expect((await c.query("UPDATE accounts SET name = 'hacked' WHERE id = $1", [b.account.id])).rowCount).toBe(0);
    });
  });

  it("a contact cannot be attached to an account in a different agency", async () => {
    // Agency A's context and stamp, but agency B's account: the policy rejects it.
    await expect(
      withContext({ agencyId: a.agency.id, accountId: b.account.id }, (c) =>
        c.query("INSERT INTO contacts (id, agency_id, account_id, first_name) VALUES (gen_random_uuid(), $1, $2, 'x')", [
          a.agency.id,
          b.account.id,
        ]),
      ),
    ).rejects.toThrow(/foreign key|row-level security/);
  });

  it("a user context alone shows that user's agencies and nothing else", async () => {
    const me = await a.agent.get("/v1/me");
    await withContext({ userId: me.body.user.id }, async (c) => {
      expect((await c.query("SELECT id FROM agencies")).rows).toEqual([{ id: a.agency.id }]);
      expect((await c.query("SELECT id FROM users")).rows).toEqual([{ id: me.body.user.id }]);
      expect(await count(c, "accounts")).toBe(0);
      expect(await count(c, "contacts")).toBe(0);
    });
  });

  it("the context does not outlive its transaction", async () => {
    await withContext({ agencyId: a.agency.id, accountId: a.account.id }, (c) => count(c, "contacts"));
    const { rows } = await pool.query("SELECT current_setting('app.agency_id', true) AS agency, count(*) FROM contacts GROUP BY 1");
    expect(rows).toEqual([]);
  });

  it("the pre-tenant look-ups only answer exact questions", async () => {
    const me = await a.agent.get("/v1/me");
    const other = await b.agent.get("/v1/me");
    const ok = await pool.query("SELECT * FROM auth_account_access($1, $2)", [me.body.user.id, a.account.id]);
    expect(ok.rows).toEqual([{ agency_id: a.agency.id, role: "owner" }]);
    const denied = await pool.query("SELECT * FROM auth_account_access($1, $2)", [other.body.user.id, a.account.id]);
    expect(denied.rows).toEqual([]);
  });
});
