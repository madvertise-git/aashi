// Two-factor sign-in and the sign-in rate limiter.
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApp, totpCode, uniqueEmail } from "./helpers";

const password = "a long enough password";
let app: INestApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(() => app.close());

async function signedUp() {
  const agent = request.agent(app.getHttpServer());
  const email = uniqueEmail();
  await agent.post("/v1/auth/sign-up").send({ name: "Meera Iyer", email, password }).expect(201);
  return { agent, email };
}

describe("two-factor sign-in", () => {
  it("is off until a code from the authenticator app confirms it", async () => {
    const { agent, email } = await signedUp();
    await agent.post("/v1/auth/two-factor/enable").send({ password: "not my password" }).expect(422);
    const setup = (await agent.post("/v1/auth/two-factor/enable").send({ password }).expect(200)).body;
    expect(setup.totpUri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.backupCodes).toHaveLength(10);
    expect((await agent.get("/v1/me")).body.user.twoFactorEnabled).toBe(false);

    // Not confirmed yet, so the password alone still signs in.
    const before = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email, password }).expect(200);
    expect(before.body.twoFactorRequired).toBe(false);

    const wrong = await agent.post("/v1/auth/two-factor/confirm").send({ code: "000000" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.code).toBe("invalid_code");
    await agent.post("/v1/auth/two-factor/confirm").send({ code: totpCode(setup.totpUri) }).expect(204);
    expect((await agent.get("/v1/me")).body.user.twoFactorEnabled).toBe(true);
  });

  it("then asks for a code after the password, and accepts each backup code once", async () => {
    const { agent, email } = await signedUp();
    const setup = (await agent.post("/v1/auth/two-factor/enable").send({ password }).expect(200)).body;
    await agent.post("/v1/auth/two-factor/confirm").send({ code: totpCode(setup.totpUri) }).expect(204);

    // Password only: no session yet.
    const fresh = request.agent(app.getHttpServer());
    const step1 = await fresh.post("/v1/auth/sign-in").send({ email, password }).expect(200);
    expect(step1.body).toEqual({ twoFactorRequired: true, user: null });
    await fresh.get("/v1/me").expect(401);

    const bad = await fresh.post("/v1/auth/two-factor/verify").send({ code: "000000" });
    expect(bad.status).toBe(422);
    await fresh.get("/v1/me").expect(401);

    const step2 = await fresh.post("/v1/auth/two-factor/verify").send({ code: totpCode(setup.totpUri) }).expect(200);
    expect(step2.body).toMatchObject({ email, twoFactorEnabled: true });
    await fresh.get("/v1/me").expect(200);

    // A backup code works in place of the app, but only once.
    const backup = setup.backupCodes[0] as string;
    const viaBackup = request.agent(app.getHttpServer());
    await viaBackup.post("/v1/auth/sign-in").send({ email, password }).expect(200);
    await viaBackup.post("/v1/auth/two-factor/verify").send({ code: backup }).expect(200);
    await viaBackup.get("/v1/me").expect(200);
    const reuse = request.agent(app.getHttpServer());
    await reuse.post("/v1/auth/sign-in").send({ email, password }).expect(200);
    await reuse.post("/v1/auth/two-factor/verify").send({ code: backup }).expect(422);
  });

  it("a code without the password step is refused", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/two-factor/verify").send({ code: "123456" });
    expect(res.status).toBe(401);
  });

  it("can be switched off again with the password", async () => {
    const { agent, email } = await signedUp();
    const setup = (await agent.post("/v1/auth/two-factor/enable").send({ password }).expect(200)).body;
    await agent.post("/v1/auth/two-factor/confirm").send({ code: totpCode(setup.totpUri) }).expect(204);
    await agent.post("/v1/auth/two-factor/disable").send({ password }).expect(204);
    const again = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email, password }).expect(200);
    expect(again.body.twoFactorRequired).toBe(false);
  });

  it("needs a signed-in user to manage", async () => {
    await request(app.getHttpServer()).post("/v1/auth/two-factor/enable").send({ password }).expect(401);
    await request(app.getHttpServer()).post("/v1/auth/two-factor/disable").send({ password }).expect(401);
  });
});

describe("sign-in rate limit", () => {
  it("allows ten attempts per email in five minutes, says so in the headers, then refuses", async () => {
    const email = uniqueEmail();
    const attempt = () => request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email, password: "wrong password" });
    const first = await attempt();
    expect(first.status).toBe(401);
    expect(first.headers["ratelimit-limit"]).toBe("10");
    expect(first.headers["ratelimit-remaining"]).toBe("9");
    for (let i = 0; i < 9; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("rate_limited");
    expect(blocked.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // The same email in different capitals is the same counter; another email is not affected.
    const upper = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email: email.toUpperCase(), password: "x" });
    expect(upper.status).toBe(429);
    const other = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email: uniqueEmail(), password: "x" });
    expect(other.status).toBe(401);
    // Twelve password checks are deliberately slow; allow for a busy machine.
  }, 30_000);
});
