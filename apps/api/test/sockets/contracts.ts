// The contract every socket adapter must keep, stand-in or real. Each function
// takes a "rig": the adapter plus the few controls a test needs (move time
// forward, make something arrive). In Phase 6 the real adapters run these same
// tests with a rig that drives the provider's sandbox.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AdsSocket,
  type AiAgentSocket,
  type AiMediaSocket,
  type AiTextSocket,
  type AiVoiceSocket,
  type CampaignBlueprint,
  type Channel,
  type ConversionsSocket,
  HANDOFF_BELOW,
  type LeadEvent,
  type LeadsSocket,
  type MessagingEvent,
  type MessagingSocket,
  MIN_DAILY_BUDGET_MINOR,
  type SocketContext,
  SocketError,
  type SocketErrorKind,
} from "../../src/sockets";

export const A: SocketContext = { agencyId: "agency-a", accountId: "account-a" };
export const B: SocketContext = { agencyId: "agency-b", accountId: "account-b" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const sha256 = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

/** Expects a SocketError of the given kind. */
export async function fails(promise: Promise<unknown>, kind: SocketErrorKind): Promise<SocketError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected a "${kind}" error`).toBeInstanceOf(SocketError);
  expect((error as SocketError).kind).toBe(kind);
  return error as SocketError;
}

interface Timed {
  /** Moves the provider's clock forward. */
  advance(ms: number): void;
  now(): number;
}

// --- Ads ----------------------------------------------------------------------
export interface AdsRig extends Timed {
  socket: AdsSocket;
}

export function adsContract(make: () => AdsRig): void {
  describe("ads socket contract", () => {
    let rig: AdsRig;
    let ads: AdsSocket;
    let blueprint: CampaignBlueprint;

    beforeEach(async () => {
      rig = make();
      ads = rig.socket;
      const account = await ads.connectAdAccount(A, { authCode: "code-from-sign-in" });
      const image = await ads.uploadCreative(A, { adAccountId: account.id, kind: "image", name: "Clinic photo", fileUrl: "https://files.example.test/a.png" });
      blueprint = {
        adAccountId: account.id,
        name: "Free dental check-up",
        objective: "leads",
        dailyBudgetMinor: 50_000,
        audience: { countries: ["IN"], ageMin: 25, ageMax: 55 },
        creativeIds: [image.id],
        headline: "Free dental check-up",
        primaryText: "Book a free check-up this week at Sunrise Dental.",
        idempotencyKey: "publish-1",
      };
    });

    it("a published campaign waits in review, then goes live", async () => {
      const campaign = await ads.publishCampaign(A, blueprint);
      expect(campaign).toMatchObject({ name: blueprint.name, status: "in_review", dailyBudgetMinor: 50_000 });
      rig.advance(HOUR);
      expect((await ads.getCampaign(A, campaign.id)).status).toBe("active");
    });

    it("publishing twice with the same key makes one campaign", async () => {
      const first = await ads.publishCampaign(A, blueprint);
      const second = await ads.publishCampaign(A, blueprint);
      expect(second.id).toBe(first.id);
      const other = await ads.publishCampaign(A, { ...blueprint, idempotencyKey: "publish-2" });
      expect(other.id).not.toBe(first.id);
    });

    it("policy problems are found in review, with a reason", async () => {
      const campaign = await ads.publishCampaign(A, { ...blueprint, primaryText: "Guaranteed results or your money back!" });
      expect(campaign.status).toBe("in_review");
      rig.advance(HOUR);
      const reviewed = await ads.getCampaign(A, campaign.id);
      expect(reviewed.status).toBe("rejected");
      expect(reviewed.rejectionReason).toBeTruthy();
      await fails(ads.pauseCampaign(A, campaign.id), "invalid");
    });

    it("refuses bad input straight away", async () => {
      await fails(ads.publishCampaign(A, { ...blueprint, dailyBudgetMinor: MIN_DAILY_BUDGET_MINOR - 1 }), "invalid");
      await fails(ads.publishCampaign(A, { ...blueprint, dailyBudgetMinor: 500.5 }), "invalid");
      await fails(ads.publishCampaign(A, { ...blueprint, creativeIds: [] }), "invalid");
      await fails(ads.publishCampaign(A, { ...blueprint, audience: { countries: ["IN"], ageMin: 13, ageMax: 30 } }), "invalid");
      await fails(ads.publishCampaign(A, { ...blueprint, creativeIds: ["no-such-creative"] }), "not_found");
      await fails(ads.connectAdAccount(A, { authCode: " " }), "invalid");
    });

    it("a video cannot be used until it has been processed", async () => {
      const video = await ads.uploadCreative(A, { adAccountId: blueprint.adAccountId, kind: "video", name: "Tour", fileUrl: "https://files.example.test/a.mp4" });
      expect(video.status).toBe("processing");
      await fails(ads.publishCampaign(A, { ...blueprint, creativeIds: [video.id] }), "invalid");
      rig.advance(HOUR);
      expect((await ads.getCreative(A, video.id)).status).toBe("ready");
      await ads.publishCampaign(A, { ...blueprint, creativeIds: [video.id] });
    });

    it("pause, resume and budget changes take effect", async () => {
      const { id } = await ads.publishCampaign(A, blueprint);
      await fails(ads.pauseCampaign(A, id), "invalid"); // still in review
      rig.advance(HOUR);
      expect((await ads.pauseCampaign(A, id)).status).toBe("paused");
      expect((await ads.resumeCampaign(A, id)).status).toBe("active");
      await fails(ads.resumeCampaign(A, id), "invalid");
      expect((await ads.changeBudget(A, id, 80_000)).dailyBudgetMinor).toBe(80_000);
      await fails(ads.changeBudget(A, id, 1), "invalid");
    });

    it("results are daily, in whole paise, never above budget, and stable between calls", async () => {
      const { id } = await ads.publishCampaign(A, blueprint);
      const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const range = () => ({ from: day(rig.now() - 10 * DAY), to: day(rig.now()) });
      expect(await ads.fetchResults(A, id, range())).toEqual([]); // nothing before it goes live
      rig.advance(3 * DAY);
      const rows = await ads.fetchResults(A, id, range());
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isInteger(row.spendMinor)).toBe(true);
        expect(row.spendMinor).toBeLessThanOrEqual(50_000);
        expect(row.clicks).toBeLessThanOrEqual(row.impressions);
        expect(row.leads).toBeLessThanOrEqual(row.clicks);
      }
      expect(await ads.fetchResults(A, id, range())).toEqual(rows);
      await fails(ads.fetchResults(A, id, { from: "2026-02-01", to: "2026-01-01" }), "invalid");
    });

    it("one account cannot see or touch another's ad account, creatives or campaigns", async () => {
      const { id } = await ads.publishCampaign(A, blueprint);
      await fails(ads.getCampaign(B, id), "not_found");
      await fails(ads.pauseCampaign(B, id), "not_found");
      await fails(ads.changeBudget(B, id, 90_000), "not_found");
      await fails(ads.fetchResults(B, id, { from: "2026-01-01", to: "2026-01-02" }), "not_found");
      await fails(ads.getCreative(B, blueprint.creativeIds[0]!), "not_found");
      await fails(ads.publishCampaign(B, { ...blueprint, idempotencyKey: "b-1" }), "not_found");
      await fails(ads.getCampaign(A, "no-such-campaign"), "not_found");
    });
  });
}

// --- Leads --------------------------------------------------------------------
export interface LeadsRig extends Timed {
  socket: LeadsSocket;
  /** Someone fills in the form. Resolves once any resulting events have been delivered. */
  submitForm(ctx: SocketContext, formId: string, fields?: Record<string, string>): Promise<{ id: string }>;
}

export function leadsContract(make: () => LeadsRig): void {
  describe("leads socket contract", () => {
    let rig: LeadsRig;
    let leads: LeadsSocket;
    let events: LeadEvent[];
    let formId: string;

    beforeEach(async () => {
      rig = make();
      leads = rig.socket;
      events = [];
      leads.onLead((event) => void events.push(event));
      formId = (await leads.listForms(A))[0]!.id;
    });

    it("lists the account's forms and their questions", async () => {
      const forms = await leads.listForms(A);
      expect(forms.length).toBeGreaterThan(0);
      for (const form of forms) expect(form.fields.length).toBeGreaterThan(0);
    });

    it("a subscribed form sends an event for each lead; the event carries IDs, the fetch carries the answers", async () => {
      await leads.subscribe(A, formId);
      await leads.subscribe(A, formId); // twice is harmless
      const submitted = await rig.submitForm(A, formId, { full_name: "Rahul Verma", phone_number: "98765 43210" });
      const unique = new Set(events.map((e) => e.eventId));
      expect(unique.size).toBe(1);
      expect(events[0]).toMatchObject({ formId, leadId: submitted.id, accountId: A.accountId, agencyId: A.agencyId });
      expect(JSON.stringify(events[0])).not.toContain("Rahul");

      const lead = await leads.fetchLead(A, submitted.id);
      // Answers come back exactly as typed; tidying the phone number is our job, not the provider's.
      expect(lead).toMatchObject({ id: submitted.id, formId, fields: { full_name: "Rahul Verma", phone_number: "98765 43210" } });
    });

    it("no events before subscribing or after unsubscribing, but the leads can still be listed", async () => {
      const since = new Date(rig.now() - MINUTE).toISOString();
      const before = await rig.submitForm(A, formId);
      await leads.subscribe(A, formId);
      await leads.unsubscribe(A, formId);
      const after = await rig.submitForm(A, formId);
      expect(events).toEqual([]);
      const listed = await leads.listLeads(A, formId, { since, until: new Date(rig.now() + MINUTE).toISOString() });
      expect(listed.map((l) => l.id).sort()).toEqual([before.id, after.id].sort());
    });

    it("one account cannot read another's forms or leads", async () => {
      await leads.subscribe(A, formId);
      const submitted = await rig.submitForm(A, formId);
      await fails(leads.fetchLead(B, submitted.id), "not_found");
      await fails(leads.subscribe(B, formId), "not_found");
      await fails(leads.listLeads(B, formId, { since: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z" }), "not_found");
      await fails(leads.fetchLead(A, "no-such-lead"), "not_found");
      expect((await leads.listForms(B)).map((f) => f.id)).not.toContain(formId);
    });
  });
}

// --- Messaging ----------------------------------------------------------------
export interface MessagingRig extends Timed {
  socket: MessagingSocket;
  /** A contact writes in. Resolves once the event has been delivered. */
  receive(ctx: SocketContext, input: { channel: Channel; from: string; text: string }): Promise<void>;
  /** Resolves once receipts for earlier sends have been delivered. */
  settle(): Promise<void>;
}

export function messagingContract(make: () => MessagingRig): void {
  describe("messaging socket contract", () => {
    const phone = "+919876543210";
    let rig: MessagingRig;
    let messaging: MessagingSocket;
    let events: MessagingEvent[];

    beforeEach(() => {
      rig = make();
      messaging = rig.socket;
      events = [];
      messaging.onEvent((event) => void events.push(event));
    });

    const approved = async (ctx: SocketContext = A) => {
      await messaging.submitTemplate(ctx, { name: "appointment_reminder", language: "en", category: "utility", body: "Hi {{1}}, your visit is at {{2}}." });
      rig.advance(3 * DAY);
    };

    it("a template is pending until it is reviewed", async () => {
      const submitted = await messaging.submitTemplate(A, { name: "welcome", language: "en", category: "marketing", body: "Welcome, {{1}}!" });
      expect(submitted.status).toBe("pending");
      await fails(messaging.sendTemplate(A, { to: phone, templateName: "welcome", language: "en", variables: ["Asha"], idempotencyKey: "k0" }), "invalid");
      rig.advance(3 * DAY);
      expect((await messaging.listTemplates(A)).find((t) => t.name === "welcome")?.status).toBe("approved");
    });

    it("refuses badly formed templates, and rejects ones that break policy in review", async () => {
      const base = { language: "en", category: "marketing" as const };
      await fails(messaging.submitTemplate(A, { ...base, name: "Has Spaces", body: "Hi" }), "invalid");
      await fails(messaging.submitTemplate(A, { ...base, name: "gaps", body: "Hi {{1}} and {{3}}" }), "invalid");
      await fails(messaging.submitTemplate(A, { ...base, name: "empty", body: " " }), "invalid");
      await messaging.submitTemplate(A, { ...base, name: "dupe", body: "Hi" });
      await fails(messaging.submitTemplate(A, { ...base, name: "dupe", body: "Hi again" }), "invalid");

      await messaging.submitTemplate(A, { ...base, name: "too_good", body: "A miracle cure, {{1}}!" });
      rig.advance(3 * DAY);
      const reviewed = (await messaging.listTemplates(A)).find((t) => t.name === "too_good");
      expect(reviewed?.status).toBe("rejected");
      expect(reviewed?.rejectionReason).toBeTruthy();
    });

    it("an approved template can be sent at any time, and receipts follow", async () => {
      await approved();
      const input = { to: phone, templateName: "appointment_reminder", language: "en", variables: ["Asha", "4 pm"], idempotencyKey: "k1" };
      const sent = await messaging.sendTemplate(A, input);
      await rig.settle();
      const statuses = events.filter((e) => e.type === "status" && e.messageId === sent.messageId).map((e) => (e.type === "status" ? e.status : ""));
      expect(new Set(statuses)).toEqual(new Set(["sent", "delivered", "read"]));

      // The same key again does not send a second message.
      expect(await messaging.sendTemplate(A, input)).toEqual(sent);

      await fails(messaging.sendTemplate(A, { ...input, variables: ["Asha"], idempotencyKey: "k2" }), "invalid");
      await fails(messaging.sendTemplate(A, { ...input, to: "9876543210", idempotencyKey: "k3" }), "invalid");
      await fails(messaging.sendTemplate(A, { ...input, templateName: "no_such", idempotencyKey: "k4" }), "not_found");
    });

    it("a free-form WhatsApp reply is only allowed within 24 hours of the contact's last message", async () => {
      const reply = (key: string) => messaging.sendReply(A, { channel: "whatsapp", to: phone, text: "Yes, we are open on Sunday.", idempotencyKey: key });
      await fails(reply("r0"), "window_closed");

      await rig.receive(A, { channel: "whatsapp", from: phone, text: "Are you open on Sunday?" });
      expect(events.find((e) => e.type === "message")).toMatchObject({ from: phone, text: "Are you open on Sunday?", accountId: A.accountId });
      rig.advance(23 * HOUR);
      await reply("r1");
      rig.advance(2 * HOUR);
      await fails(reply("r2"), "window_closed");

      // A new message from the contact opens the window again.
      await rig.receive(A, { channel: "whatsapp", from: phone, text: "Hello?" });
      await reply("r3");
      await fails(messaging.sendReply(A, { channel: "whatsapp", to: phone, text: "", idempotencyKey: "r4" }), "invalid");
    });

    it("accounts are separate: templates and reply windows do not carry across", async () => {
      await approved(A);
      await rig.receive(A, { channel: "whatsapp", from: phone, text: "Hi" });
      expect(await messaging.listTemplates(B)).toEqual([]);
      await fails(messaging.sendTemplate(B, { to: phone, templateName: "appointment_reminder", language: "en", variables: ["a", "b"], idempotencyKey: "b1" }), "not_found");
      await fails(messaging.sendReply(B, { channel: "whatsapp", to: phone, text: "Hi", idempotencyKey: "b2" }), "window_closed");
    });
  });
}

// --- Conversions --------------------------------------------------------------
export interface ConversionsRig extends Timed {
  socket: ConversionsSocket;
}

export function conversionsContract(make: () => ConversionsRig): void {
  describe("conversions socket contract", () => {
    let rig: ConversionsRig;
    const event = (overrides: Record<string, unknown> = {}) => ({
      eventId: "evt-1",
      name: "lead" as const,
      occurredAt: new Date(rig.now() - HOUR).toISOString(),
      user: { phoneHash: sha256("+919876543210") },
      ...overrides,
    });
    beforeEach(() => {
      rig = make();
    });

    it("counts each event ID once per account", async () => {
      expect(await rig.socket.sendEvent(A, event())).toEqual({ accepted: true, duplicate: false });
      expect(await rig.socket.sendEvent(A, event())).toEqual({ accepted: true, duplicate: true });
      expect(await rig.socket.sendEvent(A, event({ eventId: "evt-2" }))).toEqual({ accepted: true, duplicate: false });
      // The same ID in another account is a different event.
      expect(await rig.socket.sendEvent(B, event())).toEqual({ accepted: true, duplicate: false });
    });

    it("never accepts raw personal data", async () => {
      await fails(rig.socket.sendEvent(A, event({ user: { emailHash: "priya@example.test" } })), "invalid");
      await fails(rig.socket.sendEvent(A, event({ user: { phoneHash: "+919876543210" } })), "invalid");
      await fails(rig.socket.sendEvent(A, event({ user: {} })), "invalid");
    });

    it("refuses events that are too old, in the future, or incomplete", async () => {
      await fails(rig.socket.sendEvent(A, event({ occurredAt: new Date(rig.now() - 8 * DAY).toISOString() })), "invalid");
      await fails(rig.socket.sendEvent(A, event({ occurredAt: new Date(rig.now() + HOUR).toISOString() })), "invalid");
      await fails(rig.socket.sendEvent(A, event({ name: "purchase" })), "invalid");
      await fails(rig.socket.sendEvent(A, event({ name: "purchase", valueMinor: 1999.5, currency: "INR" })), "invalid");
      await rig.socket.sendEvent(A, event({ eventId: "evt-3", name: "purchase", valueMinor: 199_900, currency: "INR" }));
    });
  });
}

// --- AI -----------------------------------------------------------------------
export function aiTextContract(make: () => { socket: AiTextSocket }): void {
  describe("AI text socket contract", () => {
    it("writes the number of headlines asked for, about the product", async () => {
      const { texts, usage } = await make().socket.generate(A, { task: "headlines", product: "teeth whitening", audience: "working professionals", count: 4 });
      expect(texts).toHaveLength(4);
      expect(new Set(texts).size).toBe(4);
      for (const text of texts) expect(text.toLowerCase()).toContain("teeth whitening");
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
    });

    it("writes one script, and one reply to the contact's last message", async () => {
      const ai = make().socket;
      expect((await ai.generate(A, { task: "ad_script", product: "yoga classes", seconds: 30 })).texts).toHaveLength(1);
      const reply = await ai.generate(A, { task: "reply", conversation: [{ from: "contact", text: "What are your prices?" }] });
      expect(reply.texts).toHaveLength(1);
      expect(reply.texts[0]!.length).toBeGreaterThan(0);
    });

    it("refuses requests it cannot or must not answer", async () => {
      const ai = make().socket;
      await fails(ai.generate(A, { task: "headlines", product: " ", count: 3 }), "invalid");
      await fails(ai.generate(A, { task: "headlines", product: "shoes", count: 0 }), "invalid");
      await fails(ai.generate(A, { task: "ad_script", product: "shoes", seconds: 600 }), "invalid");
      await fails(ai.generate(A, { task: "reply", conversation: [{ from: "agent", text: "Hello" }] }), "invalid");
      await fails(ai.generate(A, { task: "headlines", product: "miracle weight loss pills", count: 3 }), "rejected");
    });
  });
}

export function aiMediaContract(make: () => Timed & { socket: AiMediaSocket }): void {
  describe("AI image and video socket contract", () => {
    it("a job is queued, then finishes with a file address", async () => {
      const rig = make();
      const job = await rig.socket.submitJob(A, { kind: "image", prompt: "A bright dental clinic reception", aspectRatio: "1:1", idempotencyKey: "j1" });
      expect(job).toMatchObject({ kind: "image", status: "queued" });
      expect(job.outputUrl).toBeUndefined();
      rig.advance(HOUR);
      const done = await rig.socket.getJob(A, job.id);
      expect(done.status).toBe("succeeded");
      expect(done.outputUrl).toMatch(/^https:\/\//);
    });

    it("the same key returns the same job; other accounts cannot see it", async () => {
      const rig = make();
      const input = { kind: "video" as const, prompt: "A yoga class at sunrise", aspectRatio: "9:16" as const, idempotencyKey: "j2" };
      const job = await rig.socket.submitJob(A, input);
      expect((await rig.socket.submitJob(A, input)).id).toBe(job.id);
      await fails(rig.socket.getJob(B, job.id), "not_found");
      await fails(rig.socket.getJob(A, "no-such-job"), "not_found");
    });

    it("refuses empty or policy-breaking descriptions", async () => {
      const rig = make();
      await fails(rig.socket.submitJob(A, { kind: "image", prompt: " ", aspectRatio: "1:1", idempotencyKey: "j3" }), "invalid");
      await fails(rig.socket.submitJob(A, { kind: "image", prompt: "A miracle cream", aspectRatio: "1:1", idempotencyKey: "j4" }), "rejected");
    });
  });
}

export function aiVoiceContract(make: () => { socket: AiVoiceSocket }): void {
  describe("AI voice socket contract", () => {
    it("turns text into audio, longer text into longer audio", async () => {
      const voice = make().socket;
      const short = await voice.synthesize(A, { text: "Hello.", language: "hi-IN" });
      const long = await voice.synthesize(A, { text: "Hello and welcome to Sunrise Dental. ".repeat(20), language: "hi-IN" });
      expect(short.mimeType).toMatch(/^audio\//);
      expect(short.audio.byteLength).toBeGreaterThan(44);
      expect(long.durationMs).toBeGreaterThan(short.durationMs);
      await fails(voice.synthesize(A, { text: " ", language: "hi-IN" }), "invalid");
      await fails(voice.synthesize(A, { text: "Hello", language: "xx-XX" }), "invalid");
    });

    it("turns a recording into text", async () => {
      const voice = make().socket;
      const { audio, mimeType, durationMs } = await voice.synthesize(A, { text: "Please call me back tomorrow.", language: "en-IN" });
      const result = await voice.transcribe(A, { audio, mimeType, language: "en-IN" });
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.language).toBe("en-IN");
      expect(Math.abs(result.durationMs - durationMs)).toBeLessThan(50);
      await fails(voice.transcribe(A, { audio: new Uint8Array(0), mimeType: "audio/wav" }), "invalid");
      await fails(voice.transcribe(A, { audio, mimeType: "image/png" }), "invalid");
    });
  });
}

export function aiAgentContract(make: () => { socket: AiAgentSocket }): void {
  describe("AI agent socket contract", () => {
    const knowledge = [
      { id: "kb-hours", text: "We are open Monday to Saturday, 9 am to 7 pm. Closed on Sunday." },
      { id: "kb-price", text: "A dental cleaning costs ₹1,200." },
    ];

    it("answers from the knowledge it was given and says which entries it used", async () => {
      const s = await make().socket.suggestReply(A, { conversation: [{ from: "contact", text: "Are you open on Sunday?" }], knowledge });
      expect(s.sources).toContain("kb-hours");
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.handoff).toBe(s.confidence < HANDOFF_BELOW);
    });

    it("hands off when it does not know, and when the contact asks for a person", async () => {
      const agent = make().socket;
      const unknown = await agent.suggestReply(A, { conversation: [{ from: "contact", text: "Do you do veterinary surgery?" }], knowledge });
      expect(unknown.handoff).toBe(true);
      expect(unknown.confidence).toBeLessThan(HANDOFF_BELOW);
      expect(unknown.sources).toEqual([]);
      const person = await agent.suggestReply(A, { conversation: [{ from: "contact", text: "I want to speak to a human please" }], knowledge });
      expect(person.handoff).toBe(true);
    });

    it("needs a message from the contact to reply to", async () => {
      await fails(make().socket.suggestReply(A, { conversation: [], knowledge }), "invalid");
      await fails(make().socket.suggestReply(A, { conversation: [{ from: "agent", text: "Hi" }], knowledge }), "invalid");
    });
  });
}
