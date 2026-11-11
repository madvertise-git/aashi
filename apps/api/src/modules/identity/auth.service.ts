import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Agency, Me, Role, SignInInput, SignUpInput, User } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, ProblemException, type Tx } from "../../platform";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SignedIn {
  user: User;
  /** Goes in the cookie. Only its hash is stored. */
  token: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async signUp(input: SignUpInput): Promise<SignedIn> {
    const user: User = { id: uuidv7(), email: input.email.toLowerCase(), name: input.name };
    const passwordHash = await hashPassword(input.password);
    try {
      const token = await this.database.withContext({ userId: user.id }, async (tx) => {
        await tx.insert(schema.users).values({ ...user, passwordHash });
        return this.createSession(tx, user.id);
      });
      return { user, token };
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
        throw new ProblemException(409, "email_taken", "An account with this email already exists.");
      }
      throw error;
    }
  }

  async signIn(input: SignInInput): Promise<SignedIn> {
    const row = await this.database.lookup<{ id: string; email: string; name: string; password_hash: string }>(
      sql`SELECT * FROM auth_user_by_email(${input.email})`,
    );
    const ok = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) {
      throw new ProblemException(401, "invalid_credentials", "Email or password is incorrect.");
    }
    const token = await this.database.withContext({ userId: row.id }, (tx) => this.createSession(tx, row.id));
    return { user: { id: row.id, email: row.email, name: row.name }, token };
  }

  /** Who does this cookie belong to? Undefined if it is unknown or expired. */
  async resolveSession(token: string): Promise<{ sessionId: string; userId: string } | undefined> {
    const row = await this.database.lookup<{ session_id: string; user_id: string }>(
      sql`SELECT * FROM auth_session(${hashToken(token)})`,
    );
    return row && { sessionId: row.session_id, userId: row.user_id };
  }

  async signOut(userId: string, sessionId: string): Promise<void> {
    await this.database.withContext({ userId }, (tx) =>
      tx.delete(schema.sessions).where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId))),
    );
  }

  async me(userId: string): Promise<Me> {
    return this.database.withContext({ userId }, async (tx) => {
      const [user] = await tx
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
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

  private async createSession(tx: Tx, userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await tx.insert(schema.sessions).values({
      id: uuidv7(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
  }
}
