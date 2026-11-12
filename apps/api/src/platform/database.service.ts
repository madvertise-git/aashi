import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { schema } from "@aashi/db";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { CONFIG, type Config } from "./config";

type Db = NodePgDatabase<typeof schema>;
/** A transaction that already carries the request's tenant context. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Who is asking, and on behalf of which agency and client account. */
export interface TenantContext {
  userId?: string;
  agencyId?: string;
  accountId?: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly db: Db;

  constructor(@Inject(CONFIG) config: Config) {
    this.pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      // A time limit on every query, so one slow query cannot block everyone.
      statement_timeout: 5_000,
    });
    this.db = drizzle(this.pool, { schema });
  }

  /**
   * The only way to touch tenant data. Opens a transaction, tells the database
   * who is asking, then runs `fn`. The database's row-level security uses that
   * context to decide which rows exist as far as this request is concerned.
   * The context ends with the transaction, so it cannot leak to the next request.
   */
  withContext<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT set_config('app.user_id', ${ctx.userId ?? ""}, true),
               set_config('app.agency_id', ${ctx.agencyId ?? ""}, true),
               set_config('app.account_id', ${ctx.accountId ?? ""}, true)`);
      return fn(tx);
    });
  }

  /**
   * The three look-ups that run before a tenant is known (see the auth_*
   * functions in the first migration). Not for general queries: with no context
   * set, every table looks empty.
   */
  async lookup<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T | undefined> {
    const result = await this.db.execute<T>(query);
    return result.rows[0] as T | undefined;
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
