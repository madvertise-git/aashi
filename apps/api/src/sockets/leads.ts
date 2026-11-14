import type { EventHandler, ProviderEvent, SocketContext } from "./core";

export interface LeadForm {
  id: string;
  name: string;
  /** The questions the form asks, e.g. full_name, phone_number, email, city. */
  fields: string[];
}

export interface Lead {
  id: string;
  formId: string;
  createdAt: string;
  /** Answers exactly as the person typed them. Phones are NOT yet in international format. */
  fields: Record<string, string>;
  campaignId?: string;
}

/** "A lead was submitted." Carries only IDs: fetch the lead to read the answers. */
export interface LeadEvent extends ProviderEvent {
  formId: string;
  leadId: string;
}

export interface LeadsSocket {
  listForms(ctx: SocketContext): Promise<LeadForm[]>;
  /** Start receiving events for a form. Subscribing twice is harmless. */
  subscribe(ctx: SocketContext, formId: string): Promise<void>;
  unsubscribe(ctx: SocketContext, formId: string): Promise<void>;
  /** Events arrive at least once and not always in order; the receiver de-duplicates by eventId. Returns "stop listening". */
  onLead(handler: EventHandler<LeadEvent>): () => void;
  fetchLead(ctx: SocketContext, leadId: string): Promise<Lead>;
  /** Leads created in a time range: the safety net for events that never arrived. */
  listLeads(ctx: SocketContext, formId: string, range: { since: string; until: string }): Promise<Lead[]>;
}

export const LEADS_SOCKET = Symbol("LEADS_SOCKET");
