// The walking skeleton's journey: sign up, create an agency, add a client
// account, add a contact.
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApp, uniqueEmail } from "./helpers";

let app: INestApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(() => app.close());

describe("sign up → agency → client account → contact", () => {
  it("completes the whole journey", async () => {
    const agent = request.agent(app.getHttpServer());
    const email = uniqueEmail();

    const signUp = await agent
      .post("/v1/auth/sign-up")
      .send({ name: "Priya Sharma", email, password: "a long enough password" })
      .expect(201);
    expect(signUp.body).toMatchObject({ email, name: "Priya Sharma" });
    expect(signUp.body.passwordHash).toBeUndefined();
    expect(String(signUp.headers["set-cookie"])).toMatch(/aashi\.session_token=.*HttpOnly.*SameSite=Lax/);

    expect((await agent.get("/v1/me").expect(200)).body.agencies).toEqual([]);

    const agency = (await agent.post("/v1/agencies").send({ name: "Madvertise" }).expect(201)).body;
    expect(agency).toMatchObject({ name: "Madvertise", role: "owner" });
    expect((await agent.get("/v1/me").expect(200)).body.agencies).toEqual([agency]);

    const account = (
      await agent.post(`/v1/agencies/${agency.id}/accounts`).send({ name: "Sunrise Dental" }).expect(201)
    ).body;
    expect(account).toMatchObject({ name: "Sunrise Dental", agencyId: agency.id });
    expect((await agent.get(`/v1/agencies/${agency.id}/accounts`).expect(200)).body).toEqual([account]);
    expect((await agent.get(`/v1/accounts/${account.id}`).expect(200)).body).toEqual(account);

    const contact = (
      await agent
        .post(`/v1/accounts/${account.id}/contacts`)
        .send({ firstName: "Rahul", lastName: "Verma", email: "Rahul@Example.test", phone: "98765 43210" })
        .expect(201)
    ).body;
    // A bare Indian mobile number is stored in international format.
    expect(contact).toMatchObject({ firstName: "Rahul", email: "rahul@example.test", phone: "+919876543210" });

    const list = (await agent.get(`/v1/accounts/${account.id}/contacts`).expect(200)).body;
    expect(list).toEqual({ items: [contact], nextCursor: null });
  });

  it("pages through contacts with a cursor, newest first", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/v1/auth/sign-up").send({ name: "A", email: uniqueEmail(), password: "a long enough password" });
    const agency = (await agent.post("/v1/agencies").send({ name: "Paging" })).body;
    const account = (await agent.post(`/v1/agencies/${agency.id}/accounts`).send({ name: "Client" })).body;
    for (const firstName of ["One", "Two", "Three"]) {
      await agent.post(`/v1/accounts/${account.id}/contacts`).send({ firstName }).expect(201);
    }
    const first = (await agent.get(`/v1/accounts/${account.id}/contacts?limit=2`).expect(200)).body;
    expect(first.items.map((c: { firstName: string }) => c.firstName)).toEqual(["Three", "Two"]);
    const second = (
      await agent.get(`/v1/accounts/${account.id}/contacts?limit=2&cursor=${first.nextCursor}`).expect(200)
    ).body;
    expect(second.items.map((c: { firstName: string }) => c.firstName)).toEqual(["One"]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects the same phone number twice in one account, but allows it in another", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/v1/auth/sign-up").send({ name: "A", email: uniqueEmail(), password: "a long enough password" });
    const agency = (await agent.post("/v1/agencies").send({ name: "Dupes" })).body;
    const one = (await agent.post(`/v1/agencies/${agency.id}/accounts`).send({ name: "One" })).body;
    const two = (await agent.post(`/v1/agencies/${agency.id}/accounts`).send({ name: "Two" })).body;
    const body = { firstName: "Same", phone: "+919812345678" };
    await agent.post(`/v1/accounts/${one.id}/contacts`).send(body).expect(201);
    const dupe = await agent.post(`/v1/accounts/${one.id}/contacts`).send(body).expect(409);
    expect(dupe.body.code).toBe("phone_taken");
    await agent.post(`/v1/accounts/${two.id}/contacts`).send(body).expect(201);
  });
});

describe("signing in and out", () => {
  it("signs in with the right password only, and signing out ends the session", async () => {
    const email = uniqueEmail();
    const password = "a long enough password";
    await request(app.getHttpServer()).post("/v1/auth/sign-up").send({ name: "A", email, password }).expect(201);

    const wrong = await request(app.getHttpServer()).post("/v1/auth/sign-in").send({ email, password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("invalid_credentials");
    const unknown = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: uniqueEmail(), password });
    expect(unknown.body).toEqual(wrong.body);

    const agent = request.agent(app.getHttpServer());
    const signedIn = await agent.post("/v1/auth/sign-in").send({ email: email.toUpperCase(), password }).expect(200);
    expect(signedIn.body).toMatchObject({ twoFactorRequired: false, user: { email } });
    await agent.get("/v1/me").expect(200);
    const cookie = (await agent.post("/v1/auth/sign-in").send({ email, password })).headers["set-cookie"];
    await agent.post("/v1/auth/sign-out").expect(204);
    await agent.get("/v1/me").expect(401);
    // The old cookie is dead on the server, not just cleared in the browser.
    await request(app.getHttpServer()).get("/v1/me").set("Cookie", cookie!).expect(401);
  });

  it("refuses a second sign-up with the same email", async () => {
    const email = uniqueEmail();
    const body = { name: "A", email, password: "a long enough password" };
    await request(app.getHttpServer()).post("/v1/auth/sign-up").send(body).expect(201);
    const again = await request(app.getHttpServer()).post("/v1/auth/sign-up").send(body).expect(409);
    expect(again.body.code).toBe("email_taken");
  });

  it("answers bad input with a problem document that lists what is wrong", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/sign-up")
      .send({ name: "", email: "not-an-email", password: "short" })
      .expect(422);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(["email", "name", "password"]);
  });
});

describe("health", () => {
  it("reports live and ready", async () => {
    await request(app.getHttpServer()).get("/healthz").expect(200, { status: "ok" });
    await request(app.getHttpServer()).get("/readyz").expect(200, { status: "ok" });
  });
});
