import {
  type AdAccount,
  type AdsSocket,
  type Campaign,
  type CampaignBlueprint,
  type Creative,
  type DailyResult,
  MIN_DAILY_BUDGET_MINOR,
} from "../ads";
import { AccountStore, type ChaosOptions, type Clock, type SocketContext, SocketError, StandIn } from "../core";

interface StoredCampaign extends Campaign {
  /** When review finishes and what it decides. */
  reviewedAt: number;
  verdict: "active" | "rejected";
  /** Days (YYYY-MM-DD) on which the campaign was paused all day are simply days it had no "activeSince". */
  activeSince?: number;
}
interface StoredCreative extends Creative {
  readyAt: number;
}

const DAY = 24 * 60 * 60 * 1000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A small hash, so a campaign's made-up results are the same every time they are asked for. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Stand-in for the Meta Marketing API. Campaigns wait in review, some are
 * rejected, budgets below the platform minimum are refused, and results are
 * generated from the budget so reports have believable numbers.
 */
export class AdsStandIn extends StandIn implements AdsSocket {
  private readonly accounts = new AccountStore<AdAccount>();
  private readonly creatives = new AccountStore<StoredCreative>();
  private readonly campaigns = new AccountStore<StoredCampaign>();
  private readonly byKey = new AccountStore<string>();

  constructor(
    clock?: Clock,
    chaos?: ChaosOptions,
    /** How long review and video processing take. */
    private readonly delays = { reviewMs: 2 * 60 * 1000, videoMs: 30 * 1000 },
    /** Share of clean campaigns that review rejects anyway, as happens in real life. */
    private readonly randomRejectionRate = 0,
  ) {
    super(clock, chaos);
  }

  async connectAdAccount(ctx: SocketContext, input: { authCode: string }): Promise<AdAccount> {
    await this.call(ctx);
    if (!input.authCode.trim()) throw new SocketError("invalid", "The sign-in code is missing or has expired.");
    const id = this.id("act");
    return this.accounts.put(ctx, id, { id, name: `Ad account ${id.slice(-4)}`, currency: "INR", status: "active" });
  }

  async uploadCreative(ctx: SocketContext, input: { adAccountId: string; kind: Creative["kind"]; name: string; fileUrl: string }): Promise<Creative> {
    await this.call(ctx);
    this.accounts.get(ctx, input.adAccountId, "ad account");
    if (!/^https?:\/\//.test(input.fileUrl)) throw new SocketError("invalid", "The creative's file address is not valid.");
    const id = this.id("crt");
    const stored: StoredCreative = {
      id,
      kind: input.kind,
      name: input.name,
      status: "processing",
      readyAt: this.clock.now() + (input.kind === "video" ? this.delays.videoMs : 0),
    };
    this.creatives.put(ctx, id, stored);
    return this.creative(stored);
  }

  async getCreative(ctx: SocketContext, creativeId: string): Promise<Creative> {
    await this.call(ctx);
    return this.creative(this.creatives.get(ctx, creativeId, "creative"));
  }

  async publishCampaign(ctx: SocketContext, blueprint: CampaignBlueprint): Promise<Campaign> {
    await this.call(ctx);
    const existing = this.byKey.find(ctx, blueprint.idempotencyKey);
    if (existing) return this.campaign(this.campaigns.get(ctx, existing, "campaign"));

    const account = this.accounts.get(ctx, blueprint.adAccountId, "ad account");
    if (account.status !== "active") throw new SocketError("rejected", "This ad account is disabled.");
    this.checkBudget(blueprint.dailyBudgetMinor);
    const { ageMin, ageMax, countries } = blueprint.audience;
    if (ageMin < 18 || ageMax > 65 || ageMin > ageMax) throw new SocketError("invalid", "Audience ages must be between 18 and 65.");
    if (countries.length === 0) throw new SocketError("invalid", "Choose at least one country.");
    if (blueprint.creativeIds.length === 0) throw new SocketError("invalid", "A campaign needs at least one creative.");
    for (const creativeId of blueprint.creativeIds) {
      const creative = this.creative(this.creatives.get(ctx, creativeId, "creative"));
      if (creative.status !== "ready") throw new SocketError("invalid", `Creative "${creative.name}" is still processing.`);
    }
    if (blueprint.headline.length > 40) throw new SocketError("invalid", "Headlines can be at most 40 characters.");

    // Policy problems are not caught at publish time: they surface later, in review, as on the real platform.
    const reason = this.breaksPolicy(`${blueprint.headline} ${blueprint.primaryText}`)
      ?? (this.random() < this.randomRejectionRate ? "Review: this ad does not comply with advertising standards." : undefined);
    const id = this.id("cmp");
    const stored: StoredCampaign = {
      id,
      adAccountId: blueprint.adAccountId,
      name: blueprint.name,
      objective: blueprint.objective,
      dailyBudgetMinor: blueprint.dailyBudgetMinor,
      status: "in_review",
      reviewedAt: this.clock.now() + this.delays.reviewMs,
      verdict: reason ? "rejected" : "active",
      rejectionReason: reason,
    };
    this.campaigns.put(ctx, id, stored);
    this.byKey.put(ctx, blueprint.idempotencyKey, id);
    return this.campaign(stored);
  }

  async getCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign> {
    await this.call(ctx);
    return this.campaign(this.campaigns.get(ctx, campaignId, "campaign"));
  }

  async pauseCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign> {
    await this.call(ctx);
    const stored = this.campaigns.get(ctx, campaignId, "campaign");
    const now = this.campaign(stored);
    if (now.status === "rejected") throw new SocketError("invalid", "A rejected campaign cannot be paused.");
    if (now.status === "in_review") throw new SocketError("invalid", "This campaign is still in review.");
    stored.status = "paused";
    return this.campaign(stored);
  }

  async resumeCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign> {
    await this.call(ctx);
    const stored = this.campaigns.get(ctx, campaignId, "campaign");
    if (this.campaign(stored).status !== "paused") throw new SocketError("invalid", "Only a paused campaign can be resumed.");
    stored.status = "active";
    return this.campaign(stored);
  }

  async changeBudget(ctx: SocketContext, campaignId: string, dailyBudgetMinor: number): Promise<Campaign> {
    await this.call(ctx);
    const stored = this.campaigns.get(ctx, campaignId, "campaign");
    if (this.campaign(stored).status === "rejected") throw new SocketError("invalid", "A rejected campaign has no budget to change.");
    this.checkBudget(dailyBudgetMinor);
    stored.dailyBudgetMinor = dailyBudgetMinor;
    return this.campaign(stored);
  }

  async fetchResults(ctx: SocketContext, campaignId: string, range: { from: string; to: string }): Promise<DailyResult[]> {
    await this.call(ctx);
    const stored = this.campaigns.get(ctx, campaignId, "campaign");
    const from = Date.parse(`${range.from}T00:00:00Z`);
    const to = Date.parse(`${range.to}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) throw new SocketError("invalid", "The date range is not valid.");
    if ((to - from) / DAY > 90) throw new SocketError("invalid", "Ask for at most 90 days at a time.");
    this.campaign(stored);
    if (stored.activeSince === undefined) return [];

    const rows: DailyResult[] = [];
    const last = Math.min(to, this.clock.now());
    for (let t = Math.max(from, Date.parse(`${day(stored.activeSince)}T00:00:00Z`)); t <= last; t += DAY) {
      // Spend lands between 70% and 100% of budget; clicks and leads follow from it.
      const luck = (hash(`${stored.id}:${day(t)}`) % 1000) / 1000;
      const spendMinor = Math.round(stored.dailyBudgetMinor * (0.7 + 0.3 * luck));
      const impressions = Math.round(spendMinor / 12 + luck * 500);
      const clicks = Math.round(impressions * (0.008 + 0.012 * luck));
      const leads = stored.objective === "leads" ? Math.round(clicks * (0.05 + 0.1 * luck)) : 0;
      rows.push({ date: day(t), impressions, clicks, spendMinor, leads });
    }
    return rows;
  }

  private checkBudget(dailyBudgetMinor: number): void {
    if (!Number.isInteger(dailyBudgetMinor)) throw new SocketError("invalid", "Budgets are whole paise, not decimals.");
    if (dailyBudgetMinor < MIN_DAILY_BUDGET_MINOR) throw new SocketError("invalid", "The daily budget is below the minimum of ₹100.");
  }

  private creative(stored: StoredCreative): Creative {
    if (stored.status === "processing" && this.clock.now() >= stored.readyAt) stored.status = "ready";
    return { id: stored.id, kind: stored.kind, name: stored.name, status: stored.status };
  }

  /** Applies the review verdict once its time has come, then returns the public view. */
  private campaign(stored: StoredCampaign): Campaign {
    if (stored.status === "in_review" && this.clock.now() >= stored.reviewedAt) {
      stored.status = stored.verdict;
      if (stored.verdict === "active") stored.activeSince = stored.reviewedAt;
    }
    return {
      id: stored.id,
      adAccountId: stored.adAccountId,
      name: stored.name,
      objective: stored.objective,
      dailyBudgetMinor: stored.dailyBudgetMinor,
      status: stored.status,
      ...(stored.status === "rejected" ? { rejectionReason: stored.rejectionReason } : {}),
    };
  }
}
