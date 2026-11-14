// Team invites and what each role may do.
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, inviteToken, startApp, type TenantFixture, uniqueEmail } from "./helpers";

let app: INestApplication;
let a: TenantFixture;
let b: TenantFixture;
beforeAll(async () => {
  app = await startApp();
  a = await createTenant(app, "A");
  b = await createTenant(app, "B");
});
afterAll(() => app.close());

const invite = (t: TenantFixture, email: string, role = "member") =>
  t.agent.post(`/v1/agencies/${t.agency.id}/invites`).send({ email, role });

describe("team invites", () => {
  it("an invited person joins the agency with the role they were offered", async () => {
    const email = uniqueEmail();
    const created = await invite(a, email.toUpperCase(), "admin").expect(201);
    expect(created.body).toMatchObject({ email, role: "admin" });
    expect(JSON.stringify(created.body)).not.toContain(inviteToken(app, email));

    const person = await createUser(app, email);
    expect((await person.agent.get("/v1/me")).body.agencies).toEqual([]);
    const joined = await person.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(200);
    expect(joined.body).toEqual({ id: a.agency.id, name: a.agency.name, role: "admin" });
    expect((await person.agent.get("/v1/me")).body.agencies).toEqual([joined.body]);

    // They can now work in the agency's client accounts, and appear in the team list.
    await person.agent.get(`/v1/accounts/${a.account.id}/contacts`).expect(200);
    const members = (await a.agent.get(`/v1/agencies/${a.agency.id}/members`).expect(200)).body;
    expect(members.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([[a.email, "owner"], [email, "admin"]]);
    // The invite is used up.
    const pending = (await a.agent.get(`/v1/agencies/${a.agency.id}/invites`).expect(200)).body;
    expect(pending.map((i: { email: string }) => i.email)).not.toContain(email);
    const again = await person.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) });
    expect(again.status).toBe(404);
  });

  it("a link only works for the email it was sent to", async () => {
    const email = uniqueEmail();
    await invite(a, email).expect(201);
    const someoneElse = await createUser(app);
    const res = await someoneElse.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("invite_not_found");
    // Indistinguishable from a link that never existed.
    const madeUp = await someoneElse.agent.post("/v1/invites/accept").send({ token: "x".repeat(43) });
    expect(madeUp.body).toEqual(res.body);
    expect((await someoneElse.agent.get("/v1/me")).body.agencies).toEqual([]);
  });

  it("inviting again replaces the earlier link; a revoked link stops working", async () => {
    const email = uniqueEmail();
    await invite(a, email).expect(201);
    const first = inviteToken(app, email);
    const second = (await invite(a, email).expect(201)).body;
    const person = await createUser(app, email);
    await person.agent.post("/v1/invites/accept").send({ token: first }).expect(404);

    await a.agent.delete(`/v1/agencies/${a.agency.id}/invites/${second.id}`).expect(204);
    await person.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(404);
    await a.agent.delete(`/v1/agencies/${a.agency.id}/invites/${second.id}`).expect(404);
  });

  it("refuses to invite someone who is already in the agency, or to hand out the owner role", async () => {
    const dupe = await invite(a, a.email);
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe("already_member");
    await invite(a, uniqueEmail(), "owner").expect(422);
  });

  it("the same person can be invited to two agencies and they stay separate", async () => {
    const email = uniqueEmail();
    await invite(a, email).expect(201);
    const tokenA = inviteToken(app, email);
    await invite(b, email).expect(201);
    const person = await createUser(app, email);
    await person.agent.post("/v1/invites/accept").send({ token: tokenA }).expect(200);
    await person.agent.get(`/v1/accounts/${a.account.id}`).expect(200);
    await person.agent.get(`/v1/accounts/${b.account.id}`).expect(404);
  });

  it("needs signing in", async () => {
    const { default: request } = await import("supertest");
    await request(app.getHttpServer()).post("/v1/invites/accept").send({ token: "x".repeat(43) }).expect(401);
  });
});

describe("roles", () => {
  it("a member can see the team and work with contacts, but cannot invite or add client accounts", async () => {
    const email = uniqueEmail();
    await invite(a, email, "member").expect(201);
    const member = await createUser(app, email);
    await member.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(200);

    await member.agent.get(`/v1/agencies/${a.agency.id}/members`).expect(200);
    await member.agent.post(`/v1/accounts/${a.account.id}/contacts`).send({ firstName: "Allowed" }).expect(201);

    for (const res of [
      await member.agent.post(`/v1/agencies/${a.agency.id}/invites`).send({ email: uniqueEmail(), role: "member" }),
      await member.agent.get(`/v1/agencies/${a.agency.id}/invites`),
      await member.agent.delete(`/v1/agencies/${a.agency.id}/invites/${a.invite.id}`),
      await member.agent.post(`/v1/agencies/${a.agency.id}/accounts`).send({ name: "Nope" }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("forbidden");
    }
  });
});
