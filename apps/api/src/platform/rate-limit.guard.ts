import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { KEY_VALUE, type KeyValueStore } from "./key-value";
import { ProblemException } from "./problem.filter";

export interface RateLimitRule {
  /** Names the counter, e.g. "sign-in". */
  name: string;
  /** How many requests are allowed in each window. */
  max: number;
  windowSeconds: number;
  /** Count per caller address plus this field of the body (e.g. "email"), instead of per address alone. */
  bodyField?: string;
}

const RULE = "rate-limit-rule";

/** Limits how often one caller may use a route. Use with RateLimitGuard. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RULE, rule);

/**
 * Counts requests in fixed windows in Redis, so the limit holds across every
 * copy of the API. Tells the caller where they stand in the response headers.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(KEY_VALUE) private readonly store: KeyValueStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<RateLimitRule | undefined>(RULE, context.getHandler());
    if (!rule) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const field = rule.bodyField ? (req.body as Record<string, unknown> | undefined)?.[rule.bodyField] : undefined;
    const who = [req.ip ?? "unknown", typeof field === "string" ? field.trim().toLowerCase().slice(0, 254) : ""].join("|");
    const key = `rate:${rule.name}:${who}`;

    const used = await this.store.increment(key, rule.windowSeconds);
    const reset = (await this.store.secondsLeft(key)) || rule.windowSeconds;
    res.setHeader("RateLimit-Limit", rule.max);
    res.setHeader("RateLimit-Remaining", Math.max(0, rule.max - used));
    res.setHeader("RateLimit-Reset", reset);
    if (used > rule.max) {
      res.setHeader("Retry-After", reset);
      throw new ProblemException(429, "rate_limited", `Too many attempts. Try again in ${reset} seconds.`);
    }
    return true;
  }
}
