# ADR 0002 — Sign-in on Better Auth, sessions in Redis

Status: accepted (owner's decision, 13 November 2026) · Replaces the "sign-in" deviation in ADR 0001

## Decision

1. **Better Auth is the sign-in engine.** It owns password checks, sessions, two-factor codes (authenticator app
   plus one-time backup codes) and, later, Google and Microsoft sign-in. The in-house session code is gone.
2. **It sits behind our own addresses.** Better Auth is not mounted as a web handler. `AuthService` calls it and
   passes its cookies through, so every address stays under `/v1/auth/…`, every error is a problem document with our
   codes, and the OpenAPI contract describes the whole API. Only the operations we expose can be reached.
3. **It has its own database role, `platform_auth`.** Better Auth runs its own queries and cannot set our request
   context, so it cannot use `platform_app`. `platform_auth` cannot bypass row-level security either. It has a policy
   on, and grants for, exactly five tables: `users`, `sessions`, `auth_credentials`, `auth_verifications`,
   `auth_two_factors`. It has no access to any customer table, which a test proves. Users are not customer data:
   one person can belong to several agencies.
4. **`platform_app` lost what it no longer needs:** it cannot create users or touch sessions or any `auth_*` table.
   Two of the three pre-tenant look-ups (`auth_user_by_email`, `auth_session`) are dropped. `auth_account_access`
   stays, and `auth_invite` is added with team invites (see below).
5. **Sessions live in Redis** (Valkey locally and in CI, ElastiCache in the cloud) through one small interface,
   `KeyValueStore`. Signing out deletes the session on the server. The `sessions` table is kept only because Better
   Auth declares it; nothing is written to it in normal running.
6. **Rate limiting is ours, not Better Auth's.** `RateLimitGuard` counts in Redis with one atomic step, sends the
   `RateLimit-*` headers the API rules ask for, and answers 429 as a problem document. Sign-in: 10 attempts per
   email and address in 5 minutes. Sign-up: 20 per address per hour. Two-factor codes: 10 in 5 minutes, on top of
   Better Auth's own lock after 10 wrong codes.
7. **Existing passwords carry over.** Better Auth is given our scrypt functions, and the migration copies each hash
   into `auth_credentials`. `users.password_hash` stays for one release so the change can be rolled back, then goes.
8. **Names.** Better Auth's "account" table is called `auth_credentials`, because "account" already means a client
   account here. IDs stay UUIDv7. Better Auth's usage reporting is switched off.

## The fourth pre-tenant look-up: `auth_invite`

Accepting an invite starts from a secret link, before the person belongs to the agency, so no tenant context can be
set. `auth_invite(token_hash)` answers one exact-key question and returns at most one unexpired, unused invite. It
follows the same rules as the look-ups in ADR 0001.

## Without Redis

Outside production, an unset `REDIS_URL` falls back to an in-process store so a laptop without Docker can run the
app. Production refuses to start without `REDIS_URL`.

## Not done yet

- Email verification and password reset (both need real email; Amazon SES arrives with the infrastructure work).
  Until then `Mailer` writes messages to the log.
- A QR code on the two-factor set-up screen; today it shows the key to type in.
- Trusting forwarded addresses behind Cloudflare and the load balancer, so rate limits see the real caller. This is
  set with the deployment.
