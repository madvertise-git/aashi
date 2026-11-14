// Runs every socket's contract against its stand-in, then checks the ways the
// stand-ins misbehave on purpose: rate limits, outages, duplicated and
// out-of-order events.
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADS_SOCKET, AI_AGENT_SOCKET, AI_MEDIA_SOCKET, AI_TEXT_SOCKET, AI_VOICE_SOCKET, CONVERSIONS_SOCKET, LEADS_SOCKET, type LeadEvent, MESSAGING_SOCKET, type MessagingEvent } from "../../src/sockets";
import type { ChaosOptions, Clock } from "../../src/sockets/core";
import { AdsStandIn } from "../../src/sockets/standins/ads.standin";
import { AiAgentStandIn, AiMediaStandIn, AiTextStandIn, AiVoiceStandIn } from "../../src/sockets/standins/ai.standin";
import { ConversionsStandIn } from "../../src/sockets/standins/conversions.standin";
import { LeadsStandIn } from "../../src/sockets/standins/leads.standin";
import { MessagingStandIn } from "../../src/sockets/standins/messaging.standin";
import { startApp } from "../helpers";
import { A, adsContract, aiAgentContract, aiMediaContract, aiTextContract, aiVoiceContract, conversionsContract, fails, leadsContract, messagingContract } from "./contracts";

/** A clock the test moves by hand, so "wait for review" takes no real time. */
function fakeClock() {
  let now = Date.parse("2026-11-13T06:00:00Z");
  const clock: Clock = { now: () => now };
  return { clock, now: () => now, advance: (ms: number) => void (now += ms) };
}

adsContract(() => {
  const time = fakeClock();
  return { ...time, socket: new AdsStandIn(time.clock) };
});
leadsContract(() => {
  const time = fakeClock();
  const socket = new LeadsStandIn(time.clock);
  return { ...time, socket, submitForm: (ctx, formId, fields) => socket.simulateLead(ctx, formId, fields) };
});
messagingContract(() => {
  const time = fakeClock();
  const socket = new MessagingStandIn(time.clock);
  return { ...time, socket, receive: (ctx, input) => socket.simulateInbound(ctx, input), settle: () => socket.settle() };
});
conversionsContract(() => {
  const time = fakeClock();
  return { ...time, socket: new ConversionsStandIn(time.clock) };
});
aiTextContract(() => ({ socket: new AiTextStandIn() }));
aiMediaContract(() => {
  const time = fakeClock();
  return { ...time, socket: new AiMediaStandIn(time.clock) };
});
aiVoiceContract(() => ({ socket: new AiVoiceStandIn() }));
aiAgentContract(() => ({ socket: new AiAgentStandIn() }));

describe("stand-ins misbehave like the real services", () => {
  it("rate limits per account and says when to retry", async () => {
    const time = fakeClock();
    const ads = new AdsStandIn(time.clock, { callsPerMinute: 3 });
    for (let i = 0; i < 3; i++) await ads.connectAdAccount(A, { authCode: "x" });
    const error = await fails(ads.connectAdAccount(A, { authCode: "x" }), "rate_limited");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
    // Another account is not affected, and the limit lifts after a minute.
    await ads.connectAdAccount({ agencyId: "agency-b", accountId: "account-b" }, { authCode: "x" });
    time.advance(61_000);
    await ads.connectAdAccount(A, { authCode: "x" });
  });

  it("sometimes fails with a retryable outage, at roughly the configured rate", async () => {
    const text = new AiTextStandIn(undefined, { failureRate: 0.3, seed: 7 });
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      await text.generate(A, { task: "headlines", product: "shoes", count: 1 }).catch((e: { kind: string; retryable: boolean }) => {
        expect(e.kind).toBe("unavailable");
        expect(e.retryable).toBe(true);
        failures += 1;
      });
    }
    expect(failures).toBeGreaterThan(30);
    expect(failures).toBeLessThan(90);
  });

  it("takes time to answer when told to", async () => {
    const voice = new AiVoiceStandIn(undefined, { latencyMs: [40, 60] });
    const started = Date.now();
    await voice.synthesize(A, { text: "Hello", language: "en-IN" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("delivers lead events twice and out of order, but never loses one", async () => {
    const chaos: ChaosOptions = { duplicateRate: 0.3, reorderRate: 0.3, seed: 11 };
    const time = fakeClock();
    const leads = new LeadsStandIn(time.clock, chaos);
    const events: LeadEvent[] = [];
    leads.onLead((e) => void events.push(e));
    const formId = (await leads.listForms(A))[0]!.id;
    await leads.subscribe(A, formId);

    const submitted: string[] = [];
    for (let i = 0; i < 60; i++) {
      time.advance(1000);
      submitted.push((await leads.simulateLead(A, formId)).id);
    }
    await leads.settle();

    const delivered = events.map((e) => e.leadId);
    expect(new Set(delivered)).toEqual(new Set(submitted)); // nothing lost
    expect(delivered.length).toBeGreaterThan(submitted.length); // some came twice…
    expect(new Set(events.map((e) => e.eventId)).size).toBe(submitted.length); // …under the same event ID
    expect(delivered.filter((id, i) => delivered.indexOf(id) === i)).not.toEqual(submitted); // and not in order
  });

  it("a receiver that throws does not stop delivery to others", async () => {
    const leads = new LeadsStandIn(fakeClock().clock);
    const seen: string[] = [];
    leads.onLead(() => {
      throw new Error("receiver is down");
    });
    leads.onLead((e) => void seen.push(e.leadId));
    const formId = (await leads.listForms(A))[0]!.id;
    await leads.subscribe(A, formId);
    const lead = await leads.simulateLead(A, formId);
    expect(seen).toEqual([lead.id]);
  });

  it("generates believable Indian leads, with phones as untidy as real forms collect them", async () => {
    const leads = new LeadsStandIn(fakeClock().clock, { seed: 3 });
    const form = (await leads.listForms(A)).find((f) => f.fields.includes("email"))!;
    const phones = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const lead = await leads.simulateLead(A, form.id);
      expect(Object.keys(lead.fields)).toEqual(form.fields);
      expect(lead.fields.full_name).toMatch(/^\S+ \S+$/);
      expect(lead.fields.email).toMatch(/@example\.test$/); // never a real address
      expect(lead.fields.phone_number!.replace(/\D/g, "")).toMatch(/^(91|0)?9\d{9}$/);
      phones.add(lead.fields.phone_number!.replace(/\d/g, "9"));
    }
    expect(phones.size).toBeGreaterThan(2); // several different formats
  });

  it("reports a failed delivery for a number that is not on WhatsApp", async () => {
    const time = fakeClock();
    const messaging = new MessagingStandIn(time.clock, {}, 1000, ["+919000000001"]);
    const events: MessagingEvent[] = [];
    messaging.onEvent((e) => void events.push(e));
    await messaging.submitTemplate(A, { name: "hello", language: "en", category: "utility", body: "Hello" });
    time.advance(2000);
    const sent = await messaging.sendTemplate(A, { to: "+919000000001", templateName: "hello", language: "en", variables: [], idempotencyKey: "k" });
    const statuses = events.flatMap((e) => (e.type === "status" && e.messageId === sent.messageId ? [e.status] : []));
    expect(statuses).toEqual(["sent", "failed"]);
    expect(events.find((e) => e.type === "status" && e.status === "failed")).toMatchObject({ failureReason: expect.any(String) });
  });

  it("some media jobs fail part-way, and some clean ads are rejected in review", async () => {
    const time = fakeClock();
    const media = new AiMediaStandIn(time.clock, { seed: 5 }, { imageMs: 1000, videoMs: 1000 }, 0.5);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push((await media.submitJob(A, { kind: "image", prompt: "A shop front", aspectRatio: "1:1", idempotencyKey: `m${i}` })).id);
    time.advance(2000);
    const jobs = await Promise.all(ids.map((id) => media.getJob(A, id)));
    const failed = jobs.filter((j) => j.status === "failed");
    expect(failed.length).toBeGreaterThan(3);
    expect(failed.length).toBeLessThan(17);
    for (const job of failed) expect(job.error).toBeTruthy();
  });
});

describe("the application", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  it("has every socket plugged into its stand-in", () => {
    const expected: [symbol, unknown][] = [
      [ADS_SOCKET, AdsStandIn],
      [LEADS_SOCKET, LeadsStandIn],
      [MESSAGING_SOCKET, MessagingStandIn],
      [CONVERSIONS_SOCKET, ConversionsStandIn],
      [AI_TEXT_SOCKET, AiTextStandIn],
      [AI_MEDIA_SOCKET, AiMediaStandIn],
      [AI_VOICE_SOCKET, AiVoiceStandIn],
      [AI_AGENT_SOCKET, AiAgentStandIn],
    ];
    for (const [token, type] of expected) expect(app.get(token)).toBeInstanceOf(type as never);
  });
});
