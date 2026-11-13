import { type ConversionEvent, type ConversionReceipt, type ConversionsSocket, MAX_EVENT_AGE_MS } from "../conversions";
import { AccountStore, type SocketContext, SocketError, StandIn } from "../core";

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Stand-in for the Meta Conversions API. Keeps a log of what was sent, counts
 * each event ID once, and refuses the mistakes the real API refuses: raw
 * (unhashed) personal data, events that are too old, purchases without a value.
 */
export class ConversionsStandIn extends StandIn implements ConversionsSocket {
  private readonly log = new AccountStore<ConversionEvent>();

  async sendEvent(ctx: SocketContext, event: ConversionEvent): Promise<ConversionReceipt> {
    await this.call(ctx);
    if (!event.eventId.trim()) throw new SocketError("invalid", "An event needs an ID.");
    const hashes = [event.user.emailHash, event.user.phoneHash].filter((h): h is string => h !== undefined);
    if (hashes.length === 0) throw new SocketError("invalid", "An event needs a hashed email or phone to match a person.");
    if (hashes.some((h) => !SHA256.test(h))) {
      throw new SocketError("invalid", "Emails and phones must be SHA-256 hashes, never the raw value.");
    }
    const at = Date.parse(event.occurredAt);
    const now = this.clock.now();
    if (Number.isNaN(at)) throw new SocketError("invalid", "The event time is not valid.");
    if (at > now + 60_000) throw new SocketError("invalid", "The event time is in the future.");
    if (now - at > MAX_EVENT_AGE_MS) throw new SocketError("invalid", "Events older than 7 days are not accepted.");
    if (event.name === "purchase") {
      if (!Number.isInteger(event.valueMinor) || (event.valueMinor ?? 0) <= 0 || !event.currency) {
        throw new SocketError("invalid", "A purchase needs a value in whole minor units and a currency.");
      }
    }
    if (this.log.find(ctx, event.eventId)) return { accepted: true, duplicate: true };
    this.log.put(ctx, event.eventId, event);
    return { accepted: true, duplicate: false };
  }

  /** Stand-in only: what has been counted for this account. */
  received(ctx: SocketContext): ConversionEvent[] {
    return this.log.all(ctx);
  }
}
