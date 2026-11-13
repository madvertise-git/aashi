# ADR 0003 — Sockets and stand-ins for Meta and AI

Status: accepted · Plan reference: section 2, "software first, Meta and AI last"

## Decision

1. **Eight sockets live in `apps/api/src/sockets`**: ads, leads, messaging, conversions, AI text, AI image and
   video, AI voice, AI agent. Each is a TypeScript interface written in our business terms, plus an injection token.
   Business modules import only from `sockets/index.ts`; lint refuses anything deeper.
2. **Every call names the client account** (`SocketContext`). A stand-in keeps each account's data apart, and the
   contract tests check that one account cannot see another's campaigns, leads, templates or jobs.
3. **One error type, `SocketError`,** with a small fixed set of kinds: `invalid`, `rejected`, `not_found`,
   `rate_limited`, `window_closed`, `unavailable`. `retryable` tells callers whether trying again can help. Real
   adapters must translate provider errors into these.
4. **Inbound events** (leads, messages, receipts) carry the provider's event ID and are delivered at least once and
   not always in order. De-duplicating by that ID is the receiver's job (rule 3, "never lose a lead").
5. **Stand-ins run inside the API process**, not as a separate service. They are plain classes with a clock and a
   "chaos" setting: delay, outage rate, duplicate and out-of-order events, per-account rate limits. Tests use a
   hand-moved clock, so "wait two days for template approval" takes no time. `STANDIN_BEHAVIOUR=realistic` switches
   the misbehaviour on for local development.
6. **Contract tests are functions that take a rig** (`apps/api/test/sockets/contracts.ts`): the adapter, plus the
   few controls a test needs (move time, make a lead arrive). Stand-ins run them today. In Phase 6 each real adapter
   runs the same functions with a rig that drives the provider's sandbox, then replaces one line in
   `sockets.module.ts`.

## Why in-process and not a separate fake service

The plan describes a stand-in service. A separate HTTP service would also exercise our webhook endpoints and
signature checks, but those belong to the intake pipeline, which does not exist yet. Building the fakes as classes
behind the socket gives every module something to build against now, with fast and repeatable tests. When the lead
and message intake endpoints are built, a small driver can post stand-in events to them over HTTP with signed
payloads; the stand-ins' event feeds are the place to attach it.

## What the stand-ins deliberately get right

- Ads: campaigns wait in review; policy problems surface in review, not at publish; minimum daily budget of ₹100;
  videos need processing; results are whole paise, never above budget, and repeatable.
- Leads: events carry IDs only; answers come back exactly as typed, including untidy Indian phone formats.
- Messaging: templates need approval; names and placeholders follow WhatsApp's rules; free-form replies obey the
  24-hour window; receipts can arrive twice or out of order; numbers not on WhatsApp fail after "sent".
- Conversions: each event ID counts once per account; raw emails or phones are refused; events older than 7 days
  are refused.
- AI: on-topic sample copy, placeholder media after a wait, silent audio of the right length, and an agent that
  answers only from the knowledge it is given and hands off when unsure or asked for a person.

## Not done

- No module uses a socket yet. The first will be lead intake into the CRM.
- No timer is started automatically. `LeadsStandIn.startTimer` exists for when intake does.
- Money spent and credits used are not recorded; that arrives with the usage wallet.
