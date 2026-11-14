# Aashi — agency platform

The walking skeleton from the engineering plan (Phase 3, "Foundation"): a user can **sign up, create an agency,
add a client account and add a contact**, with the database itself keeping every agency's data apart.

## What is here

```
apps/
  api/        NestJS API — one application, strict modules
    src/platform/           shared plumbing: database + tenant context, errors, health checks, outbox
    src/modules/identity/   sign-up, sign-in, two-factor codes (Better Auth behind our own addresses)
    src/modules/tenancy/    agencies, client accounts, team invites, roles
    src/modules/crm/        contacts
    test/                   integration tests, the cross-customer harness, row-level security tests
  web/        Next.js app — sign-in screens, onboarding, agency and client account switcher, contacts
    e2e/                    the journey in a real browser (Playwright)
packages/
  contracts/  validation rules (Zod), the OpenAPI contract generated from them (openapi.json)
  db/         migrations, row-level security policies, database roles, the "every table has RLS" check
docs/adr/     architecture decisions
infra/        OpenTofu: network, database, cache, containers, deploy role
```

## Run it locally

Needs Node 22+, pnpm 10 and Docker (or your own PostgreSQL 16+; Redis is optional locally).

```bash
pnpm install
docker compose up -d      # PostgreSQL 17 and Valkey (open-source Redis)
pnpm db:bootstrap         # once: creates the database roles and the dev + test databases
pnpm db:migrate
pnpm dev                  # web on http://localhost:3000, API on http://localhost:4000
```

Using your own PostgreSQL instead of Docker? Point `DATABASE_SUPERUSER_URL` at an administrator connection before
`pnpm db:bootstrap`. Without `REDIS_URL`, sessions and rate limits are kept in the API's memory (development
only). Defaults are in `.env.example`; nothing needs to be set to get started.

**Do not keep this folder inside iCloud Drive** (Desktop and Documents are synced on many Macs). iCloud removes
local copies of installed packages when disk space is low, which breaks every command in confusing ways.

## Checks

| Command | What it proves |
| --- | --- |
| `pnpm lint` | Code style, plus the rule that modules only reach each other through their `index.ts` |
| `pnpm typecheck` | Types across all packages |
| `pnpm openapi:check` | The OpenAPI contract and the web app's generated client are up to date (`pnpm openapi` regenerates both) |
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

## Deploying

`infra/` holds the OpenTofu code and `infra/README.md` the first-time steps. Releases and rollbacks are run by hand
from the Deploy workflow in GitHub Actions.

## Not built yet (rest of Phase 3)

Email verification and password reset (need Amazon SES) · tenant-keyed cache helper · finding the agency from the
domain · outbox relay and Temporal · Storybook · preview environments · tracing, Sentry and feature flags ·
security scans · seed data · backward-compatibility check on migrations.
