import { AccountStore, type ChaosOptions, type Clock, EventFeed, type EventHandler, type SocketContext, SocketError, StandIn } from "../core";
import type { Lead, LeadEvent, LeadForm, LeadsSocket } from "../leads";

// Made-up people. Phones are written the untidy ways real forms collect them.
const FIRST = ["Aarav", "Diya", "Kabir", "Ananya", "Rohan", "Ishita", "Vikram", "Sneha", "Arjun", "Pooja"];
const LAST = ["Sharma", "Patel", "Iyer", "Khan", "Reddy", "Mehta", "Nair", "Singh", "Gupta", "Das"];
const CITIES = ["Mumbai", "Pune", "Bengaluru", "Jaipur", "Kochi", "Lucknow", "Indore", "Surat"];
const PHONE_STYLES = [(n: string) => n, (n: string) => `+91${n}`, (n: string) => `0${n}`, (n: string) => `${n.slice(0, 5)} ${n.slice(5)}`, (n: string) => `91-${n}`];

/**
 * Stand-in for Meta Lead Ads. Every account has two forms. Leads appear when
 * a test or the development timer asks for one, and the "a lead arrived"
 * events are sometimes duplicated or late, as real webhooks are.
 */
export class LeadsStandIn extends StandIn implements LeadsSocket {
  private readonly forms = new AccountStore<LeadForm>();
  private readonly subscribed = new AccountStore<SocketContext>();
  private readonly leads = new AccountStore<Lead>();
  private readonly feed: EventFeed<LeadEvent>;
  private timer: NodeJS.Timeout | undefined;

  constructor(clock?: Clock, chaos: ChaosOptions = {}) {
    super(clock, chaos);
    this.feed = new EventFeed(() => this.random(), chaos);
  }

  async listForms(ctx: SocketContext): Promise<LeadForm[]> {
    await this.call(ctx);
    return this.formsFor(ctx);
  }

  async subscribe(ctx: SocketContext, formId: string): Promise<void> {
    await this.call(ctx);
    this.form(ctx, formId);
    this.subscribed.put(ctx, formId, { agencyId: ctx.agencyId, accountId: ctx.accountId });
  }

  async unsubscribe(ctx: SocketContext, formId: string): Promise<void> {
    await this.call(ctx);
    this.form(ctx, formId);
    this.subscribed.remove(ctx, formId);
  }

  onLead(handler: EventHandler<LeadEvent>): () => void {
    return this.feed.subscribe(handler);
  }

  async fetchLead(ctx: SocketContext, leadId: string): Promise<Lead> {
    await this.call(ctx);
    return this.leads.get(ctx, leadId, "lead");
  }

  async listLeads(ctx: SocketContext, formId: string, range: { since: string; until: string }): Promise<Lead[]> {
    await this.call(ctx);
    this.form(ctx, formId);
    const since = Date.parse(range.since);
    const until = Date.parse(range.until);
    if (Number.isNaN(since) || Number.isNaN(until)) throw new SocketError("invalid", "The time range is not valid.");
    return this.leads.all(ctx).filter((lead) => {
      const at = Date.parse(lead.createdAt);
      return lead.formId === formId && at >= since && at <= until;
    });
  }

  // --- Controls that only a stand-in has ---------------------------------------

  /** Someone fills in the form. The lead is stored; the event goes out only if the form is subscribed. */
  async simulateLead(ctx: SocketContext, formId: string, fields?: Record<string, string>): Promise<Lead> {
    const form = this.form(ctx, formId);
    const lead: Lead = {
      id: this.id("lead"),
      formId,
      createdAt: new Date(this.clock.now()).toISOString(),
      fields: fields ?? this.person(form),
    };
    this.leads.put(ctx, lead.id, lead);
    if (this.subscribed.find(ctx, formId)) {
      await this.feed.emit({
        eventId: this.id("evt"),
        agencyId: ctx.agencyId,
        accountId: ctx.accountId,
        occurredAt: lead.createdAt,
        formId,
        leadId: lead.id,
      });
    }
    return lead;
  }

  /** Delivers any event that was being held back to arrive late. */
  settle(): Promise<void> {
    return this.feed.flush();
  }

  /** Local development: a new lead on a random subscribed form every so often. */
  startTimer(everyMs: number, subscriptions: () => { ctx: SocketContext; formId: string }[]): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      const all = subscriptions();
      const pick = all[Math.floor(this.random() * all.length)];
      if (pick) void this.simulateLead(pick.ctx, pick.formId);
    }, everyMs);
    this.timer.unref();
  }

  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private formsFor(ctx: SocketContext): LeadForm[] {
    if (this.forms.all(ctx).length === 0) {
      for (const [name, fields] of [
        ["Free consultation", ["full_name", "phone_number", "email"]],
        ["Get a quote", ["full_name", "phone_number", "city"]],
      ] as const) {
        const id = this.id("form");
        this.forms.put(ctx, id, { id, name, fields: [...fields] });
      }
    }
    return this.forms.all(ctx);
  }

  private form(ctx: SocketContext, formId: string): LeadForm {
    this.formsFor(ctx);
    return this.forms.get(ctx, formId, "lead form");
  }

  private person(form: LeadForm): Record<string, string> {
    const pick = <T>(list: readonly T[]): T => list[Math.floor(this.random() * list.length)]!;
    const first = pick(FIRST);
    const last = pick(LAST);
    const digits = `9${Math.floor(this.random() * 1e9).toString().padStart(9, "0")}`;
    const all: Record<string, string> = {
      full_name: `${first} ${last}`,
      phone_number: pick(PHONE_STYLES)(digits),
      email: `${first}.${last}${Math.floor(this.random() * 90 + 10)}@example.test`.toLowerCase(),
      city: pick(CITIES),
    };
    return Object.fromEntries(form.fields.map((field) => [field, all[field] ?? ""]));
  }
}
