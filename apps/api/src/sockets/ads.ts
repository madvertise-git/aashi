import type { SocketContext } from "./core";

/** Money is whole minor units (paise, cents), never decimals. */
export interface AdAccount {
  id: string;
  name: string;
  currency: string;
  status: "active" | "disabled";
}

export interface Creative {
  id: string;
  kind: "image" | "video";
  name: string;
  /** Videos are processed before they can be used; images are ready at once. */
  status: "processing" | "ready" | "rejected";
}

/** Everything needed to launch a campaign, in our terms rather than the ad platform's. */
export interface CampaignBlueprint {
  adAccountId: string;
  name: string;
  objective: "leads" | "sales" | "traffic";
  dailyBudgetMinor: number;
  audience: { countries: string[]; ageMin: number; ageMax: number };
  creativeIds: string[];
  headline: string;
  primaryText: string;
  /** Publishing twice with the same key returns the first campaign instead of making a second. */
  idempotencyKey: string;
}

export interface Campaign {
  id: string;
  adAccountId: string;
  name: string;
  objective: CampaignBlueprint["objective"];
  dailyBudgetMinor: number;
  /** New campaigns wait in review. A person at the ad platform, or its software, approves or rejects them. */
  status: "in_review" | "active" | "paused" | "rejected";
  rejectionReason?: string;
}

export interface DailyResult {
  /** YYYY-MM-DD, in UTC. */
  date: string;
  impressions: number;
  clicks: number;
  spendMinor: number;
  leads: number;
}

export interface AdsSocket {
  /** Completes the "connect your ad account" step with the code the ad platform's sign-in handed back. */
  connectAdAccount(ctx: SocketContext, input: { authCode: string }): Promise<AdAccount>;
  uploadCreative(ctx: SocketContext, input: { adAccountId: string; kind: Creative["kind"]; name: string; fileUrl: string }): Promise<Creative>;
  getCreative(ctx: SocketContext, creativeId: string): Promise<Creative>;
  publishCampaign(ctx: SocketContext, blueprint: CampaignBlueprint): Promise<Campaign>;
  getCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign>;
  pauseCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign>;
  resumeCampaign(ctx: SocketContext, campaignId: string): Promise<Campaign>;
  changeBudget(ctx: SocketContext, campaignId: string, dailyBudgetMinor: number): Promise<Campaign>;
  /** One row per day, both dates included (YYYY-MM-DD). Days with no delivery are left out. */
  fetchResults(ctx: SocketContext, campaignId: string, range: { from: string; to: string }): Promise<DailyResult[]>;
}

export const ADS_SOCKET = Symbol("ADS_SOCKET");
/** The smallest daily budget an ad platform accepts: ₹100. */
export const MIN_DAILY_BUDGET_MINOR = 10_000;
