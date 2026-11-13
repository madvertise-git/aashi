import {
  type AgentSuggestion,
  type AiAgentSocket,
  type AiMediaSocket,
  type AiTextSocket,
  type AiVoiceSocket,
  type ChatTurn,
  HANDOFF_BELOW,
  type MediaJob,
  type TextTask,
  type Usage,
} from "../ai";
import { AccountStore, type ChaosOptions, type Clock, type SocketContext, SocketError, StandIn } from "../core";

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const usage = (input: string, output: string[]): Usage => ({
  inputTokens: Math.ceil(words(input) * 1.3),
  outputTokens: Math.ceil(words(output.join(" ")) * 1.3),
});

const HEADLINES = [
  "{p}, made simple",
  "Why {a} are switching to {p}",
  "Try {p} this week",
  "{p}: book a free visit",
  "The easier way to get {p}",
  "{p} that fits your day",
  "Ask us about {p}",
  "{p}, trusted nearby",
];

/** Stand-in for the LLM gateway: sample copy built from the request, so screens show something on-topic. */
export class AiTextStandIn extends StandIn implements AiTextSocket {
  async generate(ctx: SocketContext, input: TextTask): Promise<{ texts: string[]; usage: Usage }> {
    await this.call(ctx);
    if (input.task === "reply") {
      const last = input.conversation.at(-1);
      if (!last || last.from !== "contact") throw new SocketError("invalid", "There is no message from the contact to reply to.");
      const opener = input.tone === "formal" ? "Thank you for your message." : "Thanks for reaching out!";
      const texts = [`${opener} Happy to help with that. Could you share a good time for a quick call?`];
      return { texts, usage: usage(input.conversation.map((t) => t.text).join(" "), texts) };
    }
    if (!input.product.trim()) throw new SocketError("invalid", "Say what the product is.");
    const policy = this.breaksPolicy(input.product);
    if (policy) throw new SocketError("rejected", policy);
    const audience = input.audience?.trim() || "people like you";
    if (input.task === "headlines") {
      if (!Number.isInteger(input.count) || input.count < 1 || input.count > HEADLINES.length) {
        throw new SocketError("invalid", `Ask for between 1 and ${HEADLINES.length} headlines.`);
      }
      const start = Math.floor(this.random() * HEADLINES.length);
      const texts = Array.from({ length: input.count }, (_, i) =>
        HEADLINES[(start + i) % HEADLINES.length]!.replaceAll("{p}", input.product).replaceAll("{a}", audience),
      );
      return { texts, usage: usage(input.product, texts) };
    }
    if (input.seconds < 5 || input.seconds > 90) throw new SocketError("invalid", "Scripts are between 5 and 90 seconds.");
    const beats = Math.max(2, Math.round(input.seconds / 7));
    const lines = [
      `[0s] Hook: Still looking for ${input.product}?`,
      ...Array.from({ length: beats - 2 }, (_, i) => `[${(i + 1) * 7}s] Show how ${input.product} helps ${audience}.`),
      `[${(beats - 1) * 7}s] Call to action: Message us today.`,
    ];
    const texts = [lines.join("\n")];
    return { texts, usage: usage(input.product, texts) };
  }
}

interface StoredJob extends MediaJob {
  startsAt: number;
  finishesAt: number;
  fails?: string;
  aspectRatio: string;
}

/** Stand-in for hosted image and video models: a placeholder file after a believable wait. */
export class AiMediaStandIn extends StandIn implements AiMediaSocket {
  private readonly jobs = new AccountStore<StoredJob>();
  private readonly byKey = new AccountStore<string>();

  constructor(
    clock?: Clock,
    chaos?: ChaosOptions,
    private readonly durations = { imageMs: 8_000, videoMs: 90_000 },
    /** Share of jobs that fail part-way, as generation sometimes does. */
    private readonly jobFailureRate = 0,
  ) {
    super(clock, chaos);
  }

  async submitJob(
    ctx: SocketContext,
    input: { kind: MediaJob["kind"]; prompt: string; aspectRatio: "1:1" | "4:5" | "9:16" | "16:9"; idempotencyKey: string },
  ): Promise<MediaJob> {
    await this.call(ctx);
    const existing = this.byKey.find(ctx, input.idempotencyKey);
    if (existing) return this.job(this.jobs.get(ctx, existing, "job"));
    if (!input.prompt.trim()) throw new SocketError("invalid", "Describe what to generate.");
    if (input.prompt.length > 2000) throw new SocketError("invalid", "The description is too long (2000 characters at most).");
    const policy = this.breaksPolicy(input.prompt);
    if (policy) throw new SocketError("rejected", policy);

    const total = input.kind === "image" ? this.durations.imageMs : this.durations.videoMs;
    const now = this.clock.now();
    const id = this.id("job");
    const stored: StoredJob = {
      id,
      kind: input.kind,
      status: "queued",
      aspectRatio: input.aspectRatio,
      startsAt: now + total * 0.2,
      finishesAt: now + total,
      fails: this.random() < this.jobFailureRate ? "Generation failed. No credits were used; try again." : undefined,
    };
    this.jobs.put(ctx, id, stored);
    this.byKey.put(ctx, input.idempotencyKey, id);
    return this.job(stored);
  }

  async getJob(ctx: SocketContext, jobId: string): Promise<MediaJob> {
    await this.call(ctx);
    return this.job(this.jobs.get(ctx, jobId, "job"));
  }

  private job(stored: StoredJob): MediaJob {
    const now = this.clock.now();
    if (now >= stored.finishesAt) stored.status = stored.fails ? "failed" : "succeeded";
    else if (now >= stored.startsAt) stored.status = "running";
    const extension = stored.kind === "image" ? "png" : "mp4";
    return {
      id: stored.id,
      kind: stored.kind,
      status: stored.status,
      ...(stored.status === "succeeded"
        ? { outputUrl: `https://standin.invalid/media/${stored.id}-${stored.aspectRatio.replace(":", "x")}.${extension}` }
        : {}),
      ...(stored.status === "failed" ? { error: stored.fails } : {}),
    };
  }
}

/** A silent mono 8 kHz WAV file of the given length. */
function silentWav(durationMs: number): Uint8Array {
  const samples = Math.round((8000 * durationMs) / 1000);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(buffer);
}

const LANGUAGES = ["en-IN", "hi-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN"];

/** Stand-in for speech services: silence of the right length going out, a sample transcript coming back. */
export class AiVoiceStandIn extends StandIn implements AiVoiceSocket {
  async synthesize(ctx: SocketContext, input: { text: string; language: string; voice?: string }) {
    await this.call(ctx);
    if (!input.text.trim()) throw new SocketError("invalid", "There is nothing to say.");
    if (input.text.length > 5000) throw new SocketError("invalid", "Text to speak can be at most 5000 characters.");
    if (!LANGUAGES.includes(input.language)) throw new SocketError("invalid", `Language ${input.language} is not supported.`);
    // About 150 words a minute.
    const durationMs = Math.max(400, Math.round((words(input.text) / 150) * 60_000));
    return { audio: silentWav(durationMs), mimeType: "audio/wav", durationMs };
  }

  async transcribe(ctx: SocketContext, input: { audio: Uint8Array; mimeType: string; language?: string }) {
    await this.call(ctx);
    if (input.audio.byteLength < 44) throw new SocketError("invalid", "The recording is empty.");
    if (!/^audio\//.test(input.mimeType)) throw new SocketError("invalid", "That is not an audio file.");
    const language = input.language ?? "en-IN";
    if (!LANGUAGES.includes(language)) throw new SocketError("invalid", `Language ${language} is not supported.`);
    return {
      text: "Hello, I saw your ad and wanted to know the price and whether you are open on Sunday.",
      language,
      durationMs: Math.round(((input.audio.byteLength - 44) / 16000) * 1000),
    };
  }
}

const HUMAN = /\b(human|person|agent|manager|call me|speak to someone)\b/i;

/** Stand-in for the retrieval-backed AI agent: answers from the knowledge it is given, or hands off. */
export class AiAgentStandIn extends StandIn implements AiAgentSocket {
  async suggestReply(
    ctx: SocketContext,
    input: { conversation: ChatTurn[]; knowledge: { id: string; text: string }[] },
  ): Promise<AgentSuggestion> {
    await this.call(ctx);
    const last = input.conversation.at(-1);
    if (!last || last.from !== "contact") throw new SocketError("invalid", "There is no message from the contact to reply to.");

    if (HUMAN.test(last.text)) {
      return { text: "Of course. I am passing you to a member of our team now.", confidence: 1, handoff: true, sources: [] };
    }
    // "Retrieval": knowledge entries that share a meaningful word with the question.
    const asked = new Set(last.text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const hits = input.knowledge.filter((k) => (k.text.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => asked.has(w)));
    if (hits.length === 0) {
      const confidence = Number((0.15 + this.random() * 0.3).toFixed(2));
      return { text: "Let me check that with the team and get back to you shortly.", confidence, handoff: true, sources: [] };
    }
    const confidence = Number((0.55 + this.random() * 0.4).toFixed(2));
    return {
      text: hits[0]!.text,
      confidence,
      handoff: confidence < HANDOFF_BELOW,
      sources: hits.map((k) => k.id),
    };
  }
}
