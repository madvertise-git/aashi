-- Sign-in moves to Better Auth (ADR 0002). Better Auth connects as its own
-- role, platform_auth, which can reach only the sign-in tables below.
-- Sessions live in Redis; the sessions table is kept only as Better Auth's
-- declared fallback and is not written to in normal running.

-- users: the columns Better Auth expects. The password moves to
-- auth_credentials; password_hash stays for one release so this can be rolled back.
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN image text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN two_factor_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE sessions ADD COLUMN token text UNIQUE;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN ip_address text;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN user_agent text;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE sessions ALTER COLUMN token_hash DROP NOT NULL;
--> statement-breakpoint

-- How a user proves who they are: a password today, Google or Microsoft later.
-- (Better Auth calls this "account"; that word already means a client account here.)
CREATE TABLE auth_credentials (
  id                       uuid PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id              text NOT NULL,
  account_id               text NOT NULL,
  password                 text,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
--> statement-breakpoint
CREATE INDEX auth_credentials_user_id_idx ON auth_credentials (user_id);
--> statement-breakpoint
-- Short-lived values: two-factor challenges, password reset tokens.
CREATE TABLE auth_verifications (
  id         uuid PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX auth_verifications_identifier_idx ON auth_verifications (identifier);
--> statement-breakpoint
-- Authenticator-app secrets and backup codes. Both are encrypted by Better Auth
-- with the server's secret before they are stored.
CREATE TABLE auth_two_factors (
  id                        uuid PRIMARY KEY,
  user_id                   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  secret                    text NOT NULL,
  backup_codes              text NOT NULL,
  verified                  boolean NOT NULL DEFAULT true,
  failed_verification_count integer NOT NULL DEFAULT 0,
  locked_until              timestamptz
);
--> statement-breakpoint
CREATE INDEX auth_two_factors_user_id_idx ON auth_two_factors (user_id);
--> statement-breakpoint

ALTER TABLE auth_credentials   ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_credentials   FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_verifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_two_factors   ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_two_factors   FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Only the sign-in engine's role gets a policy on these tables, so every
-- other role sees them as empty.
CREATE POLICY users_sign_in_engine ON users FOR ALL TO platform_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY sessions_sign_in_engine ON sessions FOR ALL TO platform_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_credentials_sign_in_engine ON auth_credentials FOR ALL TO platform_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_verifications_sign_in_engine ON auth_verifications FOR ALL TO platform_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_two_factors_sign_in_engine ON auth_two_factors FOR ALL TO platform_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, auth_credentials, auth_verifications, auth_two_factors TO platform_auth;
--> statement-breakpoint

-- Existing passwords carry over unchanged (same scrypt format).
INSERT INTO auth_credentials (id, user_id, provider_id, account_id, password)
SELECT gen_random_uuid(), id, 'credential', id::text, password_hash FROM users WHERE password_hash IS NOT NULL;
--> statement-breakpoint

-- The everyday role no longer creates users or touches sessions, and two of the
-- three look-ups that read past row-level security are no longer needed.
REVOKE INSERT ON users FROM platform_app;
--> statement-breakpoint
REVOKE ALL ON sessions FROM platform_app;
--> statement-breakpoint
DROP FUNCTION auth_user_by_email(text);
--> statement-breakpoint
DROP FUNCTION auth_session(text);
--> statement-breakpoint
REVOKE SELECT ON users, sessions FROM platform_resolver;
