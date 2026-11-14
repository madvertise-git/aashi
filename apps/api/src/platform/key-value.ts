import { Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import type { Config } from "./config";

/**
 * The small set of Redis operations the platform relies on: sessions, rate
 * limits, short-lived values. Values are strings; times are in seconds.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Reads a value and removes it in one step, so it can be used only once. */
  getAndDelete(key: string): Promise<string | null>;
  /** Adds one to a counter. The time limit starts when the counter is created and is never extended. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Seconds until the key expires; 0 if it is gone. */
  secondsLeft(key: string): Promise<number>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export const KEY_VALUE = Symbol("KEY_VALUE");

const INCREMENT = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return v`;

export class RedisStore implements KeyValueStore {
  private readonly redis: Redis;

  constructor(url: string, private readonly prefix: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
    this.redis.on("error", (error: Error) => new Logger("Redis").error(error.message));
  }

  private k(key: string): string {
    return `${this.prefix}:${key}`;
  }
  get(key: string) {
    return this.redis.get(this.k(key));
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds && ttlSeconds > 0) await this.redis.set(this.k(key), value, "EX", Math.ceil(ttlSeconds));
    else await this.redis.set(this.k(key), value);
  }
  async delete(key: string) {
    await this.redis.del(this.k(key));
  }
  getAndDelete(key: string) {
    return this.redis.getdel(this.k(key));
  }
  async increment(key: string, ttlSeconds: number) {
    return Number(await this.redis.eval(INCREMENT, 1, this.k(key), Math.ceil(ttlSeconds)));
  }
  async secondsLeft(key: string) {
    return Math.max(0, await this.redis.ttl(this.k(key)));
  }
  async ping() {
    await this.redis.ping();
  }
  async close() {
    await this.redis.quit();
  }
}

/**
 * Stand-in for local development and tests when no Redis is running. Lives in
 * one process, so it is refused in production (see loadConfig).
 */
export class MemoryStore implements KeyValueStore {
  private readonly items = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string) {
    const item = this.items.get(key);
    if (item && item.expiresAt <= Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return item;
  }
  async get(key: string) {
    return this.live(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    this.items.set(key, { value, expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Infinity });
  }
  async delete(key: string) {
    this.items.delete(key);
  }
  async getAndDelete(key: string) {
    const value = this.live(key)?.value ?? null;
    this.items.delete(key);
    return value;
  }
  async increment(key: string, ttlSeconds: number) {
    const item = this.live(key);
    const next = Number(item?.value ?? 0) + 1;
    this.items.set(key, { value: String(next), expiresAt: item?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return next;
  }
  async secondsLeft(key: string) {
    const item = this.live(key);
    return item && item.expiresAt !== Infinity ? Math.ceil((item.expiresAt - Date.now()) / 1000) : 0;
  }
  async ping() {}
  async close() {}
}

export function createKeyValueStore(config: Config): KeyValueStore {
  if (config.redisUrl) return new RedisStore(config.redisUrl, config.keyPrefix);
  new Logger("KeyValue").warn("REDIS_URL is not set: sessions and rate limits are kept in this process only.");
  return new MemoryStore();
}
