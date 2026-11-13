import { AccountStore, type ChaosOptions, type Clock, EventFeed, type EventHandler, type SocketContext, SocketError, StandIn } from "../core";
import {
  type Channel,
  type MessageTemplate,
  type MessagingEvent,
  type MessagingSocket,
  REPLY_WINDOW_MS,
  type SentMessage,
} from "../messaging";

interface StoredTemplate extends MessageTemplate {
  reviewedAt: number;
  verdict: "approved" | "rejected";
}

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Stand-in for the WhatsApp Cloud API (and Instagram and Messenger). Templates
 * wait for approval, free-form replies obey the 24-hour window, and every send
 * is followed by receipts that can arrive twice or out of order.
 */
export class MessagingStandIn extends StandIn implements MessagingSocket {
  private readonly templates = new AccountStore<StoredTemplate>();
  private readonly lastInbound = new AccountStore<number>();
  private readonly sent = new AccountStore<SentMessage>();
  private readonly feed: EventFeed<MessagingEvent>;

  constructor(
    clock?: Clock,
    chaos: ChaosOptions = {},
    private readonly templateReviewMs = 60 * 1000,
    /** Numbers that are not on WhatsApp: sends are accepted, then fail. */
    private readonly unreachable: string[] = [],
  ) {
    super(clock, chaos);
    this.feed = new EventFeed(() => this.random(), chaos);
  }

  async listTemplates(ctx: SocketContext): Promise<MessageTemplate[]> {
    await this.call(ctx);
    return this.templates.all(ctx).map((t) => this.template(t));
  }

  async submitTemplate(ctx: SocketContext, input: Pick<MessageTemplate, "name" | "language" | "category" | "body">): Promise<MessageTemplate> {
    await this.call(ctx);
    if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
      throw new SocketError("invalid", "Template names use lower-case letters, digits and underscores only.");
    }
    if (!input.body.trim() || input.body.length > 1024) throw new SocketError("invalid", "The template body must be 1 to 1024 characters.");
    const key = `${input.name}:${input.language}`;
    if (this.templates.find(ctx, key)) throw new SocketError("invalid", "A template with this name and language already exists.");
    const numbers = [...input.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    if (numbers.some((n, i) => n !== i + 1)) throw new SocketError("invalid", "Placeholders must be numbered {{1}}, {{2}}, … in order.");

    const reason = this.breaksPolicy(input.body);
    const stored: StoredTemplate = {
      ...input,
      status: "pending",
      reviewedAt: this.clock.now() + this.templateReviewMs,
      verdict: reason ? "rejected" : "approved",
      rejectionReason: reason,
    };
    this.templates.put(ctx, key, stored);
    return this.template(stored);
  }

  async sendTemplate(
    ctx: SocketContext,
    input: { to: string; templateName: string; language: string; variables: string[]; idempotencyKey: string },
  ): Promise<SentMessage> {
    await this.call(ctx);
    const repeat = this.sent.find(ctx, input.idempotencyKey);
    if (repeat) return repeat;
    this.checkPhone(input.to);
    const stored = this.templates.find(ctx, `${input.templateName}:${input.language}`);
    if (!stored) throw new SocketError("not_found", "No such template in that language.");
    const template = this.template(stored);
    if (template.status !== "approved") throw new SocketError("invalid", `This template is ${template.status}, not approved.`);
    const expected = new Set([...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
    if (input.variables.length !== expected) {
      throw new SocketError("invalid", `This template needs ${expected} variable(s); ${input.variables.length} given.`);
    }
    return this.send(ctx, "whatsapp", input.to, input.idempotencyKey);
  }

  async sendReply(ctx: SocketContext, input: { channel: Channel; to: string; text: string; idempotencyKey: string }): Promise<SentMessage> {
    await this.call(ctx);
    const repeat = this.sent.find(ctx, input.idempotencyKey);
    if (repeat) return repeat;
    if (input.channel === "whatsapp") this.checkPhone(input.to);
    if (!input.text.trim() || input.text.length > 4096) throw new SocketError("invalid", "A message must be 1 to 4096 characters.");
    const last = this.lastInbound.find(ctx, `${input.channel}:${input.to}`);
    if (last === undefined || this.clock.now() - last > REPLY_WINDOW_MS) {
      throw new SocketError("window_closed", "More than 24 hours since this contact's last message. Send an approved template instead.");
    }
    return this.send(ctx, input.channel, input.to, input.idempotencyKey);
  }

  onEvent(handler: EventHandler<MessagingEvent>): () => void {
    return this.feed.subscribe(handler);
  }

  // --- Controls that only a stand-in has ---------------------------------------

  /** A contact writes in. This opens (or renews) their 24-hour reply window. */
  async simulateInbound(ctx: SocketContext, input: { channel: Channel; from: string; text: string }): Promise<void> {
    const now = this.clock.now();
    this.lastInbound.put(ctx, `${input.channel}:${input.from}`, now);
    await this.feed.emit({
      type: "message",
      eventId: this.id("evt"),
      agencyId: ctx.agencyId,
      accountId: ctx.accountId,
      occurredAt: new Date(now).toISOString(),
      channel: input.channel,
      messageId: this.id("wamid"),
      from: input.from,
      text: input.text,
    });
  }

  settle(): Promise<void> {
    return this.feed.flush();
  }

  private async send(ctx: SocketContext, channel: Channel, to: string, idempotencyKey: string): Promise<SentMessage> {
    const message: SentMessage = { messageId: this.id("wamid") };
    this.sent.put(ctx, idempotencyKey, message);
    const statuses = this.unreachable.includes(to) ? (["sent", "failed"] as const) : (["sent", "delivered", "read"] as const);
    for (const status of statuses) {
      await this.feed.emit({
        type: "status",
        eventId: this.id("evt"),
        agencyId: ctx.agencyId,
        accountId: ctx.accountId,
        occurredAt: new Date(this.clock.now()).toISOString(),
        channel,
        messageId: message.messageId,
        status,
        ...(status === "failed" ? { failureReason: "This number is not on WhatsApp." } : {}),
      });
    }
    return message;
  }

  private checkPhone(to: string): void {
    if (!E164.test(to)) throw new SocketError("invalid", "Phone numbers must be in international format, e.g. +919876543210.");
  }

  private template(stored: StoredTemplate): MessageTemplate {
    if (stored.status === "pending" && this.clock.now() >= stored.reviewedAt) stored.status = stored.verdict;
    return {
      name: stored.name,
      language: stored.language,
      category: stored.category,
      body: stored.body,
      status: stored.status,
      ...(stored.status === "rejected" ? { rejectionReason: stored.rejectionReason } : {}),
    };
  }
}
