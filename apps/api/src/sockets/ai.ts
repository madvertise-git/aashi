import type { SocketContext } from "./core";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

// --- AI text ------------------------------------------------------------------
export type TextTask =
  | { task: "headlines"; product: string; audience?: string; count: number }
  | { task: "ad_script"; product: string; audience?: string; seconds: number }
  | { task: "reply"; conversation: ChatTurn[]; tone?: "friendly" | "formal" };

export interface AiTextSocket {
  /** Headlines return `count` texts; a script or a reply returns one. */
  generate(ctx: SocketContext, input: TextTask): Promise<{ texts: string[]; usage: Usage }>;
}
export const AI_TEXT_SOCKET = Symbol("AI_TEXT_SOCKET");

// --- AI image and video -------------------------------------------------------
export interface MediaJob {
  id: string;
  kind: "image" | "video";
  status: "queued" | "running" | "succeeded" | "failed";
  /** Present once succeeded. */
  outputUrl?: string;
  /** Present once failed. */
  error?: string;
}

export interface AiMediaSocket {
  /** Generation takes seconds (images) to minutes (video), so it is a job: submit, then check. */
  submitJob(
    ctx: SocketContext,
    input: { kind: MediaJob["kind"]; prompt: string; aspectRatio: "1:1" | "4:5" | "9:16" | "16:9"; idempotencyKey: string },
  ): Promise<MediaJob>;
  getJob(ctx: SocketContext, jobId: string): Promise<MediaJob>;
}
export const AI_MEDIA_SOCKET = Symbol("AI_MEDIA_SOCKET");

// --- AI voice -----------------------------------------------------------------
export interface AiVoiceSocket {
  synthesize(
    ctx: SocketContext,
    input: { text: string; language: string; voice?: string },
  ): Promise<{ audio: Uint8Array; mimeType: string; durationMs: number }>;
  transcribe(ctx: SocketContext, input: { audio: Uint8Array; mimeType: string; language?: string }): Promise<{ text: string; language: string; durationMs: number }>;
}
export const AI_VOICE_SOCKET = Symbol("AI_VOICE_SOCKET");

// --- AI agent -----------------------------------------------------------------
export interface ChatTurn {
  from: "contact" | "agent";
  text: string;
}

export interface AgentSuggestion {
  text: string;
  /** 0–1: how sure the agent is. Low confidence must go to a person, not the contact. */
  confidence: number;
  /** True when a person should take over: low confidence, or the contact asked for one. */
  handoff: boolean;
  /** Which knowledge-base entries the answer leaned on. */
  sources: string[];
}

export interface AiAgentSocket {
  /** "AI suggests, a human approves": this never sends anything itself. */
  suggestReply(
    ctx: SocketContext,
    input: { conversation: ChatTurn[]; knowledge: { id: string; text: string }[] },
  ): Promise<AgentSuggestion>;
}
export const AI_AGENT_SOCKET = Symbol("AI_AGENT_SOCKET");
/** Below this, a suggestion is handed to a person. */
export const HANDOFF_BELOW = 0.5;
