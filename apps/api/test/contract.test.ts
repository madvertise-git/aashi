// The OpenAPI contract and the real API must agree: same routes, and replies
// that match the documented shapes exactly (no missing or extra fields).
import type { INestApplication } from "@nestjs/common";
import * as c from "@aashi/contracts";
import { operations } from "@aashi/contracts/openapi";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { createTenant, startApp, type TenantFixture } from "./helpers";

let app: INestApplication;
let t: TenantFixture;
beforeAll(async () => {
  app = await startApp();
  t = await createTenant(app, "Contract");
});
afterAll(() => app.close());

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Every route the running application answers, as "METHOD /path/{param}". */
function realRoutes(): string[] {
  const stack = (app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }).router.stack;
  return stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route!.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path.replace(/:(\w+)/g, "{$1}")}`),
    )
    .sort();
}

/** Parsing drops unknown fields, so "parsed equals original" means the reply has exactly the documented fields. */
function matches(schema: z.ZodType, body: unknown): void {
  expect(schema.parse(body)).toEqual(body);
}

describe("the OpenAPI contract", () => {
  it("lists exactly the routes the API serves", () => {
    const documented = operations.map((op) => `${op.method.toUpperCase()} ${op.path}`).sort();
    expect(realRoutes()).toEqual(documented);
  });

  it("gives every operation a unique name", () => {
    const ids = operations.map((op) => op.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes what the API really returns", async () => {
    const get = async (path: string) => (await t.agent.get(path).expect(200)).body as unknown;
    matches(c.health, await get("/healthz"));
    matches(c.me, await get("/v1/me"));
    matches(c.account.array(), await get(`/v1/agencies/${t.agency.id}/accounts`));
    matches(c.account, await get(`/v1/accounts/${t.account.id}`));
    matches(c.member.array(), await get(`/v1/agencies/${t.agency.id}/members`));
    matches(c.invite.array(), await get(`/v1/agencies/${t.agency.id}/invites`));
    matches(c.page(c.contact), await get(`/v1/accounts/${t.account.id}/contacts`));
    matches(c.contact, await get(`/v1/accounts/${t.account.id}/contacts/${t.contact.id}`));
    matches(c.page(c.company), await get(`/v1/accounts/${t.account.id}/companies`));
    matches(c.company, await get(`/v1/accounts/${t.account.id}/companies/${t.company.id}`));
    matches(c.tag.array(), await get(`/v1/accounts/${t.account.id}/tags`));
    matches(c.page(c.note), await get(`/v1/accounts/${t.account.id}/contacts/${t.contact.id}/notes`));
    matches(c.customField.array(), await get(`/v1/accounts/${t.account.id}/custom-fields`));
    matches(c.company, t.company);
    matches(c.tag, t.tag);
    matches(c.note, t.note);
    matches(c.customField, t.field);
    matches(c.agency, t.agency);
    matches(c.contact, t.contact);
    matches(c.invite, t.invite);

    const signIn = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email: t.email, password: t.password });
    matches(c.signInResult, signIn.body);
    const setup = await t.agent.post("/v1/auth/two-factor/enable").send({ password: t.password }).expect(200);
    matches(c.twoFactorSetup, setup.body);
  });

  it("describes errors too", async () => {
    for (const res of [
      await request(app.getHttpServer()).get("/v1/me"),
      await t.agent.get(`/v1/accounts/${crypto.randomUUID()}`),
      await t.agent.post(`/v1/accounts/${t.account.id}/contacts`).send({ firstName: "" }),
      await t.agent.get("/v1/no-such-route"),
    ]) {
      expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
      matches(c.problem, res.body);
    }
  });
});
