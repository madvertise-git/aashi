# Aashi — agency platform

The walking skeleton from the engineering plan (Phase 3, "Foundation"): a user can **sign up, create an agency,
add a client account and add a contact**, with the database itself keeping every agency's data apart.

## What is here

```
apps/
  api/        NestJS API — one application, strict modules
    src/platform/           shared plumbing: database + tenant context, errors, health checks, outbox
    src/modules/identity/   sign-up, sign-in, sessions
    src/modules/tenancy/    agencies, client accounts, membership checks
    src/modules/crm/        contacts
    test/                   integration tests, the cross-customer harness, row-level security tests
  web/        Next.js app — sign-in screens, onboarding, agency and client account switcher, contacts
    e2e/                    the journey in a real browser (Playwright)
packages/
  contracts/  validation rules (Zod) and response types shared by screens and server
  db/         migrations, row-level security policies, database roles, the "every table has RLS" check
docs/adr/     architecture decisions
```

## Run it locally

Needs Node 22+, pnpm 10 and Docker (or any PostgreSQL 16+).

```bash
pnpm install
docker compose up -d      # PostgreSQL 17; creates the roles and the dev + test databases on first start
pnpm db:migrate
pnpm dev                  # web on http://localhost:3000, API on http://localhost:4000
```

Using your own PostgreSQL instead of Docker? Run `pnpm db:bootstrap` once, pointing `DATABASE_SUPERUSER_URL` at a
superuser connection. Defaults for local development are in `.env.example`; nothing needs to be set to get started.

## Checks

| Command | What it proves |
| --- | --- |
| `pnpm lint` | Code style, plus the rule that modules only reach each other through their `index.ts` |
| `pnpm typecheck` | Types across all packages |
| `pnpm db:check-rls` | Every table has row-level security enabled **and forced** |
| `pnpm test` | The journey through the API; agency A using agency B's IDs always gets "not found"; the database refuses cross-customer reads and writes even with the API's checks skipped |
| `pnpm e2e` | The journey in a real browser |
| `pnpm build` | Production builds of the API and web app |

CI (`.github/workflows/ci.yml`) runs all of them on every pull request.

## How the wall between customers works

Read `docs/adr/0001-tenancy-and-row-level-security.md`. In short: the API connects as a database role that cannot
bypass row-level security; each request tells the database who is asking and for which agency and client account;
the database returns only that customer's rows. A query that forgets its filter returns nothing, not someone else's
data.

**Adding a table:** stamp it with `agency_id` (and `account_id` for client data), enable and force row-level
security in the same migration, add a policy, and grant `platform_app` only what it needs.
**Adding an endpoint:** add it to `ACTIONS` in `apps/api/test/cross-customer.test.ts`.

## Not built yet (rest of Phase 3)

Redis (sessions, cache helper, rate limiter) · Better Auth, two-factor codes, invites · OpenAPI document and
generated client · finding the agency from the domain · outbox relay and Temporal · stand-in services and contract
tests · Storybook · infrastructure code, preview environments, deploys · monitoring and feature flags · security
scans · seed data · backward-compatibility check on migrations.
