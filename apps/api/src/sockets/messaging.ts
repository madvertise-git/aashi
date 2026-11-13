import type { EventHandler, ProviderEvent, SocketContext } from "./core";

export type Channel = "whatsapp" | "instagram" | "messenger";

/** A pre-approved WhatsApp message, the only kind allowed outside the 24-hour window. */
export interface MessageTemplate {
  /** Lower-case letters, digits and underscores only. */
  name: string;
  language: string;
  category: "marketing" | "utility" | "authentication";
  /** Placeholders are written {{1}}, {{2}}, … */
  body: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
}

export interface SentMessage {
  messageId: string;
}

/** A message from a contact. */
export interface InboundMessageEvent extends ProviderEvent {
  type: "message";
  channel: Channel;
  messageId: string;
  /** The contact: an E.164 phone for WhatsApp, the platform's user ID otherwise. */
  from: string;
  text: string;
}

/** What happened to a message we sent. "read" can arrive before "delivered". */
export interface MessageStatusEvent extends ProviderEvent {
  type: "status";
  channel: Channel;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  failureReason?: string;
}

export type MessagingEvent = InboundMessageEvent | MessageStatusEvent;

export interface MessagingSocket {
  listTemplates(ctx: SocketContext): Promise<MessageTemplate[]>;
  /** Sends a template for review. Approval takes minutes to days. */
  submitTemplate(ctx: SocketContext, input: Pick<MessageTemplate, "name" | "language" | "category" | "body">): Promise<MessageTemplate>;
  /** Allowed at any time, but only with an approved template and the right number of variables. */
  sendTemplate(
    ctx: SocketContext,
    input: { to: string; templateName: string; language: string; variables: string[]; idempotencyKey: string },
  ): Promise<SentMessage>;
  /** Free-form text. On WhatsApp only within 24 hours of the contact's last message ("window_closed" otherwise). */
  sendReply(ctx: SocketContext, input: { channel: Channel; to: string; text: string; idempotencyKey: string }): Promise<SentMessage>;
  /** Inbound messages and delivery receipts: at least once, not always in order. Returns "stop listening". */
  onEvent(handler: EventHandler<MessagingEvent>): () => void;
}

export const MESSAGING_SOCKET = Symbol("MESSAGING_SOCKET");
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
