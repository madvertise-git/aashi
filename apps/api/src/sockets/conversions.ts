import type { SocketContext } from "./core";

/** Something good that happened after an ad, sent back so future ads find similar people. */
export interface ConversionEvent {
  /** Ours, and unique per real-world event: sending the same ID twice must count once. */
  eventId: string;
  name: "lead" | "booked" | "purchase";
  occurredAt: string;
  /** Required for purchases. Whole minor units. */
  valueMinor?: number;
  currency?: string;
  /** At least one. Always SHA-256 hashes (lower-case hex) of the trimmed, lower-cased value; never the raw value. */
  user: { emailHash?: string; phoneHash?: string };
  /** The ad platform's lead ID, when the person came from a lead form. */
  sourceLeadId?: string;
}

export interface ConversionReceipt {
  accepted: true;
  /** True when this eventId had been sent before; it was not counted again. */
  duplicate: boolean;
}

export interface ConversionsSocket {
  sendEvent(ctx: SocketContext, event: ConversionEvent): Promise<ConversionReceipt>;
}

export const CONVERSIONS_SOCKET = Symbol("CONVERSIONS_SOCKET");
/** Ad platforms refuse events older than this. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
