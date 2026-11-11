# ADR 0001 — Tenancy and row-level security

Status: accepted for the walking skeleton · Plan reference: golden rule 2, section 11

## Decision

1. **Every tenant row is stamped** with `agency_id`, and client data with `account_id` as well.
2. **Row-level security is enabled and forced on every table.** CI fails if a table is missing it
   (`pnpm db:check-rls`).
3. **The API connects as `platform_app`**, which cannot bypass row-level security and cannot change the schema.
   Migrations run as `platform_owner`. `platform_breakglass` exists with login switched off.
4. **Each request runs in one transaction that first sets three settings** — `app.user_id`, `app.agency_id`,
   `app.account_id` — and the policies read them. Unset means "no rows". The settings end with the transaction,
   so a pooled connection cannot carry one customer's context into the next request.
   `DatabaseService.withContext` is the only way to reach tenant data.
5. **Links carry the tenant.** `contacts` points at `accounts (id, agency_id)` with a two-column foreign key, so a
   contact can never be attached to an account in another agency.
6. **Other customers' data is "not found", never "forbidden".**

## The three pre-tenant look-ups

Three questions have to be answered before a tenant is known: *who has this email?* (sign-in), *whose session is
this?* (every request) and *may this user work in this client account, and which agency is it in?*
(`/v1/accounts/{accountId}/…` routes). They are `SECURITY DEFINER` functions (`auth_user_by_email`,
`auth_session`, `auth_account_access`) owned by `platform_resolver`, a role nobody can log in as. Each answers one
exact-key question and returns at most one row. They are the only code that reads past row-level security; adding
another needs two reviewers.

## What this protects against, and what it does not

It protects against **bugs in our code**: a forgotten `WHERE`, a wrong ID in an address, a mixed-up cache. It does
not protect against someone who can run arbitrary SQL as `platform_app`, because that role sets its own context.
That is what network isolation, secrets management and the audit trail are for.

## Deviations from the plan, to revisit

- **Sign-in is a small in-house implementation** (scrypt password hashes, opaque session tokens stored hashed in
  PostgreSQL) instead of Better Auth, and sessions are not yet in Redis. It sits behind the identity module's
  facade so it can be swapped without touching other modules. Two-factor codes and invites are not built.
- **No OpenAPI document yet.** Screens and server share Zod rules and TypeScript types from `packages/contracts`.
