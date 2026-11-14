# Aashi — agency growth platform

This file briefs Claude Code on what the product is, how it must be built, what exists today and what to do next.
The full source is the *Agency Platform Engineering Plan v1.0* (19 October 2026, owner: Sambhav Jain, Madvertise).
Where this file and the plan disagree, ask the owner.

## 1. What we are building

One platform for marketing agencies that does two jobs which today need separate tools:

- **Run the business** (GoHighLevel-style): contacts, sales pipelines, a shared inbox for email, SMS and WhatsApp,
  automations, appointment calendars, landing pages and funnels, phone calls, billing, and white-label resale.
- **Create and launch ads** (Zeely-style): turn a product into AI-made image and video ads and launch Meta
  campaigns in a few clicks.

The edge is **one data model that follows a lead end to end**:
creative made in the studio → campaign launched on Meta → lead lands in the CRM → conversation on WhatsApp →
deal moves stage → the sale is sent back to Meta so future ads find similar buyers.

**Who uses it.** An *agency* is the customer. Each agency has many *client accounts* (the agency's own clients).
Agency staff work across accounts; a client's own team works inside one account. Agencies can resell the platform
under their own brand and domain. Madvertise's own client accounts are the first customer ("tenant zero").
The market is India first: Indian phone formats, DLT rules for SMS, DPDP privacy law, data kept in India.

### The sixteen modules

| # | Module | What it does | Ships in |
| --- | --- | --- | --- |
| 1 | Tenancy and white-label | Agencies, client accounts, branding, custom domains, resale plans | Foundation, R3 |
| 2 | Identity and access | Login, two-factor codes, team invites, roles and permissions | Foundation, R1 |
| 3 | CRM | Contacts, companies, custom fields, tags, notes, tasks, saved lists, import/export | R1 |
| 4 | Pipelines | Deals moving across stages on a drag-and-drop board | R1 |
| 5 | Calendars and booking | Availability, booking pages, round-robin, reminders, Google/Outlook sync | R1 |
| 6 | Conversations (inbox) | One inbox for email, SMS, web chat, WhatsApp, Instagram, Messenger | R1–R2 |
| 7 | Workflow automation | Visual "if this, then that" builder with waits, branches, goals | R2 |
| 8 | Funnels, websites, forms | Drag-and-drop pages, multi-step funnels, forms, A/B tests, custom domains | R1–R2 |
| 9 | Phone and SMS | Numbers, browser calling, recordings, two-way SMS, missed-call text-back | R2–R3 |
| 10 | AI creative studio | Brand kits, templates, image/video ad editor, "generate with AI" | R3 |
| 11 | Ads manager | Build Meta campaigns from a wizard, launch, see results | R3 |
| 12 | AI assistants | Reply suggestions, an AI agent that chats with leads, voice AI | Phase 6 |
| 13 | Reports and dashboards | Leads, pipeline, appointments, messages and ad results in one view | R2–R3 |
| 14 | Billing and usage wallet | Subscriptions, invoices, prepaid wallet for messages, calls, AI credits | R3 |
| 15 | Developer platform | Public API, outgoing webhooks, Zapier app, MCP connector | R3 |
| 16 | Mobile app | Inbox, contacts, notifications, calling on Android and iPhone | R2–R3 |

**Deliberately not in version one:** courses and memberships, communities, social media planner, invoices/estimates/
e-signature, review management, affiliate manager, blogs, Google/TikTok/LinkedIn ads, Hindi interface. A new request
gets a phase or goes on this list. It never goes into the current sprint.

## 2. The key decision: software first, Meta and AI last

Build the whole product first. Connect the real Meta services and AI models at the end (Phase 6). Until then, every
place that will talk to Meta or an AI model goes through a **socket** (an adapter with a fixed interface) and is
answered by a **stand-in** (a realistic fake). In Phase 6 each stand-in is unplugged and the real service is plugged
into the same socket; the rest of the code must not change.

- A socket describes what *our business* needs ("publish this campaign"), not how Meta's API happens to work.
- Stand-ins must be realistic: add delays, return rate-limit errors, reject bad input the way Meta does, and send
  webhooks duplicated or out of order now and then. A fake that never fails hides the hard problems.
- Contract tests are written against the stand-ins. The real adapters must pass the same tests.

| Socket | Our software asks | Stand-in behaviour | Real service (Phase 6) |
| --- | --- | --- | --- |
| Ads | Connect ad account; publish campaign from a blueprint; pause; change budget; upload creative; fetch results | Fake IDs, review delays, occasional rejections, generated results | Meta Marketing API |
| Leads | Subscribe to lead forms; receive and fetch leads | Fake leads on a timer, some duplicated or out of order | Meta Lead Ads webhooks and API |
| Messaging | Send template; send reply; list/submit templates; receive messages and receipts | Fake replies, receipts, template rejections, 24-hour window rules | WhatsApp Cloud API, Instagram, Messenger |
| Conversions | Send an event (lead, booked, purchase) with an event ID | Logs events; checks event ID uniqueness | Meta Conversions API |
| AI text | Generate headlines, script, reply from context | Sample answers; sometimes slow or failing | LLM gateway (Claude, GPT, Gemini) |
| AI image and video | Submit a generation job; check or receive the result | Placeholder files after a realistic delay | Hosted image, video, avatar models |
| AI voice | Text to speech; transcribe a recording | Silent audio; sample transcript | Sarvam, ElevenLabs, Deepgram |
| AI agent | Suggest or send a reply given the conversation and knowledge base | Canned replies with random confidence | LLM gateway with retrieval (pgvector) |

Email, SMS, calls, payments, Google/Microsoft calendars and file storage are **not** deferred: they are built and
connected normally.

## 3. Rules that settle every decision

1. **Build the socket now, plug in the appliance later.** Nothing calls Meta or an AI model directly.
2. **One wall between customers, enforced by the database.** Every row is stamped with its agency and client account.
   PostgreSQL row-level security refuses to return another customer's rows even if our code has a bug.
3. **Never lose a lead.** Anything arriving from outside (form, webhook, message) is verified, saved raw,
   acknowledged, then processed in the background with retries and de-duplicated by the provider's event ID.
4. **Small changes, shipped often.** Small pull requests (aim under 400 changed lines), weekly releases, unfinished
   features hidden behind feature flags.
5. **The main branch always works.**
6. **If it is not tested, it is not done.** Tests are written with the feature, including a cross-customer test for
   every new endpoint.
7. **Design before code.** Anything bigger than a few days gets a short RFC in `docs/rfc`; big decisions get an ADR
   in `docs/adr`.
8. **Measure everything from day one.** Logs, metrics, traces, usage analytics.
9. **Security and privacy are features.** Consent records, deletion on request, audit trails, encryption.
10. **Use it ourselves first.**

### Data rules
- IDs are UUIDv7, generated by the API. All times are UTC. Money is whole paise or cents, never decimals.
- Unique rules always include the account ("one phone per account", never "one per platform").
- Phones are stored in international format (E.164).
- Every index starts with the account ID. Links between records include the tenant (composite foreign keys).
- Deletion is real: a DPDP deletion request removes or anonymises personal data.
- Migrations use expand → dual write → backfill → switch → contract, so every release can be rolled back.

### API rules
- Addresses name the client account: `/v1/accounts/{accountId}/contacts`.
- Other customers' data is **"not found", never "forbidden"**.
- One error format everywhere: RFC 9457 problem details, with a stable `code`.
- Paging with cursors. Idempotency keys on writes. Rate-limit information in response headers.
- Contract first: the OpenAPI document is the contract; clients and docs are generated from it.
- Breaking changes go to `/v2`.

### Code rules
- One main application split into strict modules (a "modular monolith"). A module reaches another only through its
  `index.ts`. Lint enforces this.
- TypeScript everywhere; Python only for AI and media work.
- Conventional Commits. No secrets in code. Every bug fix comes with a test that would have caught it.
- Login, billing, security policies, migrations and socket adapters are risky areas that need two reviewers.
- Every cache key starts with the agency and account IDs. Money is never decided from cache.
- White-label by design: every colour, logo and name comes from the account's theme, never hard-coded.
- Accessibility target is WCAG 2.2 AA. Screens must work on mid-range Android phones and patchy 4G.

## 4. Technology

| Layer | Choice |
| --- | --- |
| Repo | One monorepo: pnpm + Turborepo, GitHub Actions |
| Web | Next.js (React 19, App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query/Table/Virtual, React Hook Form + Zod, Storybook |
| Builders | React Flow (workflows), Puck (pages), Unlayer (email), Polotno (creative), dnd-kit (pipeline), FullCalendar, Tiptap, ECharts |
| Mobile | Expo (React Native) |
| API | Node.js 24 LTS, NestJS, Drizzle ORM, REST + OpenAPI |
| Background work | Temporal (long-running, automations), BullMQ on Redis (short jobs) |
| Live updates | Centrifugo |
| Events | Transactional outbox, then Redpanda (from Release 2) |
| Login | Better Auth plus our own roles |
| Data | PostgreSQL 17 on Aurora (source of truth), Valkey/Redis, ClickHouse (reports, from R3), Typesense (search, from R2), S3 |
| AI and media | Python 3.13 + FastAPI behind sockets; Remotion, FFmpeg, Sharp; LiteLLM gateway |
| Providers | Amazon SES, Nango (Gmail/Outlook), MSG91 or Gupshup (SMS), Exotel or Plivo (calls), Razorpay + Stripe, Lago, Svix |
| Cloud | AWS Mumbai (standby in Hyderabad), Cloudflare in front, ECS Fargate, OpenTofu, GrowthBook flags |
| Observability | OpenTelemetry → Grafana Cloud, Sentry, PostHog |
| Testing | Vitest, Testcontainers, Playwright, contract tests, MSW, k6 |

## 5. What exists today

Merged to `main` (PR #1): the **walking skeleton**. A user can sign up, create an agency, add a client account and
add a contact. It runs locally and in CI. **Nothing is deployed anywhere yet.**

```
apps/api/        NestJS API
  src/platform/            database + tenant context, errors, health checks, outbox helper
  src/modules/identity/    sign-up, sign-in, sessions
  src/modules/tenancy/     agencies, client accounts, membership checks
  src/modules/crm/         contacts
  test/                    journey, cross-customer harness, row-level security tests
apps/web/        Next.js app: sign-in screens, onboarding, agency/account switcher, contacts; e2e/ (Playwright)
packages/contracts/   Zod rules and response types shared by web and API
packages/db/          migrations, RLS policies, database roles, "every table has RLS" check
docs/adr/0001-tenancy-and-row-level-security.md   read this before touching the database
```

How tenancy works in the code:
- The API connects as `platform_app`, which cannot bypass row-level security. Migrations run as `platform_owner`.
  `platform_breakglass` exists with login off.
- `DatabaseService.withContext(ctx, fn)` is the only way to reach tenant data. It opens a transaction and sets
  `app.user_id`, `app.agency_id` and `app.account_id`; the policies read them. Unset means no rows.
- Request pipeline: `SessionGuard` (who is this?) → `AgencyGuard` or `AccountGuard` (are they a member?) →
  service runs inside `withContext`.
- Three `SECURITY DEFINER` functions (`auth_user_by_email`, `auth_session`, `auth_account_access`) are the only code
  that reads past row-level security. Do not add another without an ADR.
- Events are written to `outbox` in the same transaction as the change. Nothing relays them yet.

Commands: `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`.
Checks: `pnpm lint`, `pnpm typecheck`, `pnpm db:check-rls`, `pnpm test`, `pnpm e2e`, `pnpm build`.

**When adding a table:** stamp it with `agency_id` (and `account_id` for client data), enable *and force* row-level
security in the same migration, add a policy, grant `platform_app` only what it needs, and mirror it in
`packages/db/src/schema.ts`.
**When adding an endpoint:** add it to `ACTIONS` in `apps/api/test/cross-customer.test.ts`.

### Where the skeleton departs from the plan
- **Sign-in is a small in-house implementation** (scrypt hashes, session tokens stored hashed in PostgreSQL), not
  Better Auth, and sessions are not in Redis. No two-factor codes or invites. The owner has not yet decided whether
  to switch; the recommendation is to switch before real users sign up.
- **No OpenAPI document or generated client.** Web and API share types from `packages/contracts`.
- Runs on Node 22 (plan says 24). Tests use a plain PostgreSQL connection, not Testcontainers.
- Memberships are agency-level only; there are no account-level roles for a client's own team yet.

## 6. What to do next

### Finish Phase 3 (Foundation), in this order
1. **Sign-in:** Better Auth (pending the owner's decision), two-factor codes, team invites, the agency → account
   switcher backed by roles.
2. **Redis:** sessions, the first rate limiter (sign-in first), and a cache helper that adds the tenant to every key
   and protects against stampedes.
3. **OpenAPI:** generate the document from the API, generate the typed web client from it.
4. **Request pipeline:** find the agency from the request's domain (needed for white-label).
5. **Events:** outbox relay; a Temporal dev cluster with a "hello" workflow.
6. **Stand-in service:** fake Meta (campaigns, leads, WhatsApp messages on a timer, realistic errors) and fake AI
   (sample copy, placeholder images), with contract tests for every socket.
7. **Frontend foundation:** design system components in Storybook with theming through colour variables; error
   handling, translations and analytics wiring.
8. **Infrastructure and delivery:** OpenTofu for network, ECS, Aurora, ElastiCache, S3, Cloudflare, Secrets Manager
   and KMS; preview environment per pull request; one-click deploy with tested rollback; pipeline under 10 minutes.
9. **Operations:** OpenTelemetry, Grafana, Sentry, feature flags, security scans in CI, a check that migrations are
   backward compatible, seed scripts with realistic fake Indian names, phones and companies.

Phase 3 is done when: the skeleton is live in production; the pipeline runs under 10 minutes with rollback tested;
the RLS check and cross-customer harness are green; stand-ins serve fake leads, messages and AI output; dashboards
and alerts exist for every service.

### Then Phase 4 (Build), three releases
- **Release 1 — Run the business:** contacts, companies, custom fields, tags, notes, tasks, import/export, saved
  lists; pipelines; calendars and booking with Google/Outlook sync; email sending and two-way sync; roles and team;
  privacy features (consent records, audit trail, data export, delete on request); forms and simple landing pages.
- **Release 2 — Automate and talk:** workflow builder on Temporal; unified inbox for email, SMS, web chat, plus
  WhatsApp, Instagram and Messenger through the stand-in; DLT-compliant SMS; funnels, custom domains, A/B tests;
  reports v1; mobile app v1. Automations need brakes: dry-run mode, daily sending limits, quiet hours, a kill switch.
- **Release 3 — Create, sell and scale:** creative studio and ads manager on stand-ins; phone numbers and calling;
  billing, plans and the usage wallet (an append-only ledger); white-label and resale with account snapshots; public
  API, outgoing webhooks, Zapier app; mobile calling.

### Later phases
- **Phase 5 — Use it ourselves:** Madvertise runs real client work for four weeks on everything that does not need
  Meta or AI.
- **Phase 6 — Plug in Meta and AI,** one plug at a time, lowest risk first: Lead Ads → WhatsApp/Instagram/Messenger →
  campaigns, results and conversion events → AI text → AI images and video → AI agents ("AI suggests, a human
  approves"). Each plug: swap, run the same contract tests, switch on for Madvertise only, watch a week, move on.
- **Phase 7 — Beta and launch:** closed beta with 5–10 agencies, external penetration test, load test at 10×,
  disaster-recovery drill, public launch.
- **Phase 8 — Operate and grow.**

Service targets at launch: 99.9% uptime (99.99% for lead capture); 95% of reads under 300 ms and writes under
500 ms; a lead in the CRM within 5 seconds; at most 5 minutes of data loss. Design for 5,000 agencies, 100,000
client accounts, 250 million contacts and 20 million messages a day without a rewrite.

## 7. Open decisions and things only the owner can do

**Decisions waiting on the owner**
- Better Auth versus keeping the in-house sign-in.
- Whether to freeze a smaller version one. The proposal was: login and tenancy, CRM, pipelines, forms, a basic
  inbox, and the Meta and AI stand-ins. Not yet confirmed. Until it is, do not build past the foundation without
  asking.

**The owner's work, not Claude Code's**
- Business approvals, which take weeks and cannot be sped up: Meta Business Verification, TRAI DLT registration,
  Meta developer apps and WhatsApp Business account, Google OAuth verification, telephony KYC, Razorpay and Stripe
  merchant accounts, Apple and Google developer accounts, legal documents (terms, privacy policy, DPDP notices).
- Creating and paying for accounts: AWS, Cloudflare, a domain. Production deployment is blocked until these exist.
- Running deployments, holding secrets and keys, watching production.
- Testing each feature as a real user and reporting what is wrong.
- Arranging an external security test before real client data goes in.

## 8. Working agreements for Claude Code

- Work on a short-lived branch and open a pull request; do not push to `main` directly. Merge only when asked.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm db:check-rls`, `pnpm test` and `pnpm e2e` before pushing.
- Say plainly when something departs from the plan, and record the decision in `docs/adr`.
- Never put real client data or real secrets in code, tests, seeds or fixtures. Test data is always fake.
- Report in plain language: lead with what was done, how it was checked, and what needs the owner's decision.
