// The cross-customer harness: run every action as agency A using agency B's
// IDs and expect "not found". Every new endpoint must be added to ACTIONS.
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, startApp, type TenantFixture } from "./helpers";

interface Action {
  name: string;
  method: "get" | "post";
  /** The address, built from the *other* customer's IDs. */
  path: (other: TenantFixture) => string;
  body?: Record<string, unknown>;
}

const ACTIONS: Action[] = [
  { name: "list accounts", method: "get", path: (o) => `/v1/agencies/${o.agency.id}/accounts` },
  { name: "create account", method: "post", path: (o) => `/v1/agencies/${o.agency.id}/accounts`, body: { name: "Intruder" } },
  { name: "get account", method: "get", path: (o) => `/v1/accounts/${o.account.id}` },
  { name: "list contacts", method: "get", path: (o) => `/v1/accounts/${o.account.id}/contacts` },
  { name: "create contact", method: "post", path: (o) => `/v1/accounts/${o.account.id}/contacts`, body: { firstName: "Intruder" } },
];

let app: INestApplication;
let a: TenantFixture;
let b: TenantFixture;

beforeAll(async () => {
  app = await startApp();
  a = await createTenant(app, "A");
  b = await createTenant(app, "B");
});
afterAll(() => app.close());

describe("agency A using agency B's IDs", () => {
  it.each(ACTIONS)("$name → 404", async (action) => {
    const res = await a.agent[action.method](action.path(b)).send(action.body);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    // The reply must look exactly like the one for an ID that does not exist at all.
    const missing = await a.agent[action.method](
      action.path({ ...b, agency: { ...b.agency, id: crypto.randomUUID() }, account: { ...b.account, id: crypto.randomUUID() } }),
    ).send(action.body);
    expect(res.body).toEqual(missing.body);
  });

  it("left agency B's data untouched and invisible", async () => {
    const accounts = (await b.agent.get(`/v1/agencies/${b.agency.id}/accounts`).expect(200)).body;
    expect(accounts).toEqual([b.account]);
    const contacts = (await b.agent.get(`/v1/accounts/${b.account.id}/contacts`).expect(200)).body;
    expect(contacts.items).toEqual([b.contact]);
    const mine = (await a.agent.get("/v1/me").expect(200)).body;
    expect(mine.agencies.map((x: { id: string }) => x.id)).toEqual([a.agency.id]);
  });
});

describe("without signing in", () => {
  it.each(ACTIONS)("$name → 401", async (action) => {
    const res = await request(app.getHttpServer())[action.method](action.path(a)).send(action.body);
    expect(res.status).toBe(401);
  });

  it("a malformed ID is just 'not found'", async () => {
    await a.agent.get("/v1/accounts/not-a-uuid/contacts").expect(404);
    await a.agent.get("/v1/agencies/not-a-uuid/accounts").expect(404);
  });
});
