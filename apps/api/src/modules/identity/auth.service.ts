import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  Agency,
  Me,
  Role,
  SignInInput,
  SignInResult,
  SignUpInput,
  TwoFactorSetup,
  User,
} from "@aashi/contracts";
import { schema } from "@aashi/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import pg from "pg";
import { CONFIG, type Config, DatabaseService, KEY_VALUE, type KeyValueStore, ProblemException } from "../../platform";
import { createEngine, type Engine } from "./engine";

/** The browser's request and our reply: the engine reads cookies from one and sets them on the other. */
export interface Http {
  req: Request;
  res: Response;
}

/** How the engine's error codes read in our API. Anything else keeps its status with a generic code. */
const ERRORS: Record<string, [status: number, code: string, detail: string]> = {
  INVALID_EMAIL_OR_PASSWORD: [401, "invalid_credentials", "Email or password is incorrect."],
  USER_ALREADY_EXISTS: [409, "email_taken", "An account with this email already exists."],
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: [409, "email_taken", "An account with this email already exists."],
  INVALID_PASSWORD: [422, "wrong_password", "That password is incorrect."],
  INVALID_CODE: [422, "invalid_code", "That code is not right. Check it and try again."],
  INVALID_BACKUP_CODE: [422, "invalid_code", "That backup code is not right, or has already been used."],
  INVALID_TWO_FACTOR_COOKIE: [401, "two_factor_expired", "Sign in again to continue."],
  TOTP_NOT_ENABLED: [422, "two_factor_not_set_up", "Two-factor sign-in is not set up."],
  TWO_FACTOR_NOT_ENABLED: [422, "two_factor_not_set_up", "Two-factor sign-in is not set up."],
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: [429, "two_factor_locked", "Too many wrong codes. Sign in again."],
  ACCOUNT_TEMPORARILY_LOCKED: [429, "two_factor_locked", "Too many wrong codes. Try again in 15 minutes."],
};

interface EngineUser {
  id: string;
  email: string;
  name: string;
  twoFactorEnabled?: boolean | null;
}

const toUser = (u: EngineUser): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  twoFactorEnabled: u.twoFactorEnabled === true,
});

@Injectable()
export class AuthService implements OnModuleDestroy {
  /** The sign-in engine's own connection (platform_auth): it can reach the sign-in tables and nothing else. */
  private readonly pool: pg.Pool;
  private readonly engine: Engine;

  constructor(
    @Inject(CONFIG) config: Config,
    @Inject(KEY_VALUE) store: KeyValueStore,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {
    this.pool = new pg.Pool({ connectionString: config.authDatabaseUrl, max: 5, statement_timeout: 5_000 });
    this.engine = createEngine(config, store, this.pool);
  }

  async signUp(input: SignUpInput, http: Http): Promise<User> {
    const data = await this.run<{ user: EngineUser }>(http, (headers) =>
      this.engine.api.signUpEmail({ body: input, headers, asResponse: true }),
    );
    return toUser(data.user);
  }

  /** With two-factor switched on, the password alone does not sign the user in: a code must follow. */
  async signIn(input: SignInInput, http: Http): Promise<SignInResult> {
    const data = await this.run<{ user?: EngineUser; twoFactorRedirect?: boolean }>(http, (headers) =>
      this.engine.api.signInEmail({ body: input, headers, asResponse: true }),
    );
    if (data.twoFactorRedirect || !data.user) return { twoFactorRequired: true, user: null };
    return { twoFactorRequired: false, user: toUser(data.user) };
  }

  /** The second step of signing in. Accepts a 6-digit authenticator code or a backup code. */
  async verifyTwoFactor(code: string, http: Http): Promise<User> {
    const data = await this.run<{ user: EngineUser }>(http, (headers) =>
      /^\d{6}$/.test(code)
        ? this.engine.api.verifyTOTP({ body: { code }, headers, asResponse: true })
        : this.engine.api.verifyBackupCode({ body: { code }, headers, asResponse: true }),
    );
    return toUser({ ...data.user, twoFactorEnabled: true });
  }

  /** Starts two-factor set-up. It only takes effect once confirmTwoFactor succeeds. */
  async enableTwoFactor(password: string, http: Http): Promise<TwoFactorSetup> {
    const data = await this.run<{ totpURI: string; backupCodes: string[] }>(http, (headers) =>
      this.engine.api.enableTwoFactor({ body: { password }, headers, asResponse: true }),
    );
    return { totpUri: data.totpURI, backupCodes: data.backupCodes };
  }

  async confirmTwoFactor(code: string, http: Http): Promise<void> {
    await this.run(http, (headers) => this.engine.api.verifyTOTP({ body: { code }, headers, asResponse: true }));
  }

  async disableTwoFactor(password: string, http: Http): Promise<void> {
    await this.run(http, (headers) => this.engine.api.disableTwoFactor({ body: { password }, headers, asResponse: true }));
  }

  async signOut(http: Http): Promise<void> {
    await this.run(http, (headers) => this.engine.api.signOut({ headers, asResponse: true }));
  }

  /** Who does this request's cookie belong to? Undefined if it is unknown or expired. */
  async resolveSession(req: Request): Promise<{ sessionId: string; userId: string; email: string } | undefined> {
    if (!req.headers.cookie) return undefined;
    const found = await this.engine.api.getSession({ headers: this.headers(req) });
    return found ? { sessionId: found.session.id, userId: found.user.id, email: found.user.email } : undefined;
  }

  async me(userId: string): Promise<Me> {
    return this.database.withContext({ userId }, async (tx) => {
      const [user] = await tx
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          twoFactorEnabled: schema.users.twoFactorEnabled,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      if (!user) throw new ProblemException(401, "unauthenticated", "Sign in required.");
      const rows = await tx
        .select({ id: schema.agencies.id, name: schema.agencies.name, role: schema.memberships.role })
        .from(schema.memberships)
        .innerJoin(schema.agencies, eq(schema.agencies.id, schema.memberships.agencyId))
        .where(eq(schema.memberships.userId, userId))
        .orderBy(schema.agencies.id);
      const agencies: Agency[] = rows.map((r) => ({ ...r, role: r.role as Role }));
      return { user, agencies };
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private headers(req: Request): Headers {
    const headers = new Headers();
    if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
    if (req.headers["user-agent"]) headers.set("user-agent", req.headers["user-agent"]);
    if (req.ip) headers.set("x-forwarded-for", req.ip);
    return headers;
  }

  /** Calls the engine, passes its cookies on to the browser, and turns its errors into ours. */
  private async run<T = unknown>(http: Http, call: (headers: Headers) => Promise<globalThis.Response>): Promise<T> {
    const reply = await call(this.headers(http.req));
    for (const cookie of reply.headers.getSetCookie()) http.res.append("Set-Cookie", cookie);
    const data = (await reply.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
    if (!reply.ok) {
      const known = data?.code ? ERRORS[data.code] : undefined;
      if (known) throw new ProblemException(...known);
      throw new ProblemException(
        reply.status >= 400 && reply.status < 500 ? reply.status : 500,
        reply.status === 401 ? "unauthenticated" : "sign_in_failed",
        data?.message ?? "Something went wrong.",
      );
    }
    return data as T;
  }
}
