// Shared by every socket: who is asking, how failures are reported, and the
// controls that make stand-ins behave like real, imperfect services.

/** Every socket call is made on behalf of one client account. */
export interface SocketContext {
  agencyId: string;
  accountId: string;
}

export type SocketErrorKind =
  /** The input is wrong and will never work as sent. */
  | "invalid"
  /** The provider refused it on policy grounds (ad review, template review, content rules). */
  | "rejected"
  /** No such thing, or it belongs to another account. */
  | "not_found"
  /** Too many calls. Try again after `retryAfterSeconds`. */
  | "rate_limited"
  /** WhatsApp's 24-hour rule: a free-form reply is only allowed within 24 hours of the contact's last message. */
  | "window_closed"
  /** The provider is down or timed out. Safe to retry. */
  | "unavailable";

/** The one error every socket throws, whichever provider is plugged in. */
export class SocketError extends Error {
  constructor(
    readonly kind: SocketErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SocketError";
  }
  /** True when the same call may succeed later without being changed. */
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "unavailable";
  }
}

/** Something that arrives from a provider. Delivery is at-least-once and may be out of order. */
export interface ProviderEvent {
  /** The provider's own ID for this event. The same event delivered twice carries the same ID. */
  eventId: string;
  accountId: string;
  agencyId: string;
  occurredAt: string;
}

export type EventHandler<E> = (event: E) => Promise<void> | void;

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

/** How badly a stand-in should behave. All zero means perfectly behaved, which is what most tests want. */
export interface ChaosOptions {
  /** Fixes the "random" choices, so a run can be repeated exactly. */
  seed?: number;
  /** Pause before answering, in milliseconds, picked between these two. */
  latencyMs?: [min: number, max: number];
  /** Share of calls (0–1) that fail with "unavailable". */
  failureRate?: number;
  /** Share of events (0–1) delivered twice. */
  duplicateRate?: number;
  /** Share of events (0–1) held back and delivered after the next one. */
  reorderRate?: number;
  /** Calls allowed per account per minute before "rate_limited". 0 means no limit. */
  callsPerMinute?: number;
}

/** What local development uses: slow enough and flaky enough to surface the hard problems. */
export const REALISTIC: ChaosOptions = {
  latencyMs: [80, 600],
  failureRate: 0.03,
  duplicateRate: 0.1,
  reorderRate: 0.1,
  callsPerMinute: 120,
};

/** Shared plumbing for stand-ins: delays, failures, rate limits, IDs and event delivery. */
export class StandIn {
  private state: number;
  private sequence = 0;
  private readonly calls = new Map<string, number[]>();

  constructor(
    protected readonly clock: Clock = systemClock,
    protected readonly chaos: ChaosOptions = {},
  ) {
    this.state = chaos.seed ?? 0x2f6e2b1;
  }

  /** A repeatable random number between 0 and 1 (mulberry32). */
  protected random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  protected id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString().padStart(6, "0")}${Math.floor(this.random() * 1e6).toString(36)}`;
  }

  /** Run at the start of every socket call: waits, counts the call, and sometimes fails. */
  protected async call(ctx: SocketContext): Promise<void> {
    const [min, max] = this.chaos.latencyMs ?? [0, 0];
    const wait = min + this.random() * (max - min);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    const limit = this.chaos.callsPerMinute ?? 0;
    if (limit > 0) {
      const now = this.clock.now();
      const recent = (this.calls.get(ctx.accountId) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= limit) {
        const retryAfter = Math.max(1, Math.ceil((60_000 - (now - recent[0]!)) / 1000));
        throw new SocketError("rate_limited", "Too many calls for this account. Slow down.", retryAfter);
      }
      recent.push(now);
      this.calls.set(ctx.accountId, recent);
    }
    if (this.random() < (this.chaos.failureRate ?? 0)) {
      throw new SocketError("unavailable", "The provider did not answer. Try again.");
    }
  }

  /** Text that looks like it breaks ad or messaging policy, the way providers reject it. */
  protected breaksPolicy(text: string): string | undefined {
    const banned = ["guaranteed results", "100% cure", "get rich quick", "miracle"];
    const hit = banned.find((phrase) => text.toLowerCase().includes(phrase));
    return hit && `Content policy: "${hit}" is not allowed.`;
  }
}

/** Delivers provider events to whoever is listening: sometimes twice, sometimes late. */
export class EventFeed<E extends ProviderEvent> {
  private readonly handlers: EventHandler<E>[] = [];
  private held: E | undefined;

  constructor(
    private readonly random: () => number,
    private readonly chaos: ChaosOptions,
  ) {}

  subscribe(handler: EventHandler<E>): () => void {
    this.handlers.push(handler);
    return () => {
      const at = this.handlers.indexOf(handler);
      if (at >= 0) this.handlers.splice(at, 1);
    };
  }

  async emit(event: E): Promise<void> {
    if (!this.held && this.random() < (this.chaos.reorderRate ?? 0)) {
      this.held = event; // goes out after the next one
      return;
    }
    await this.deliver(event);
    if (this.held) {
      const late = this.held;
      this.held = undefined;
      await this.deliver(late);
    }
  }

  /** Sends anything still held back. Stand-ins call this when asked to settle. */
  async flush(): Promise<void> {
    if (!this.held) return;
    const late = this.held;
    this.held = undefined;
    await this.deliver(late);
  }

  private async deliver(event: E): Promise<void> {
    const times = this.random() < (this.chaos.duplicateRate ?? 0) ? 2 : 1;
    for (let i = 0; i < times; i++) {
      for (const handler of [...this.handlers]) {
        // A real provider retries when the receiver fails; one throwing handler must not stop the others.
        try {
          await handler(event);
        } catch {
          // The receiver's own retry and dead-letter handling is tested with the intake pipeline.
        }
      }
    }
  }
}

/** Per-account storage, so a stand-in keeps customers apart exactly as the real provider's credentials would. */
export class AccountStore<T> {
  private readonly byAccount = new Map<string, Map<string, T>>();

  private bucket(ctx: SocketContext): Map<string, T> {
    let bucket = this.byAccount.get(ctx.accountId);
    if (!bucket) this.byAccount.set(ctx.accountId, (bucket = new Map()));
    return bucket;
  }
  put(ctx: SocketContext, id: string, value: T): T {
    this.bucket(ctx).set(id, value);
    return value;
  }
  find(ctx: SocketContext, id: string): T | undefined {
    return this.bucket(ctx).get(id);
  }
  /** Throws "not_found" for an unknown ID, and for one that belongs to another account. */
  get(ctx: SocketContext, id: string, what: string): T {
    const value = this.find(ctx, id);
    if (!value) throw new SocketError("not_found", `No such ${what}.`);
    return value;
  }
  remove(ctx: SocketContext, id: string): void {
    this.bucket(ctx).delete(id);
  }
  all(ctx: SocketContext): T[] {
    return [...this.bucket(ctx).values()];
  }
}
