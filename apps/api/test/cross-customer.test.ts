// The cross-customer harness: run every action as agency A using agency B's
// IDs and expect "not found". Every new endpoint must be added to ACTIONS.
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, startApp, type TenantFixture } from "./helpers";

interface Action {
  name: string;
  method: "get" | "post" | "patch" | "put" | "delete";
  /** The address, built from the *other* customer's IDs. */
  path: (other: TenantFixture) => string;
  body?: Record<string, unknown>;
}

const ACTIONS: Action[] = [
  { name: "list accounts", method: "get", path: (o) => `/v1/agencies/${o.agency.id}/accounts` },
  { name: "create account", method: "post", path: (o) => `/v1/agencies/${o.agency.id}/accounts`, body: { name: "Intruder" } },
  { name: "list members", method: "get", path: (o) => `/v1/agencies/${o.agency.id}/members` },
  { name: "list invites", method: "get", path: (o) => `/v1/agencies/${o.agency.id}/invites` },
  { name: "create invite", method: "post", path: (o) => `/v1/agencies/${o.agency.id}/invites`, body: { email: "intruder@example.test", role: "admin" } },
  { name: "revoke invite", method: "delete", path: (o) => `/v1/agencies/${o.agency.id}/invites/${o.invite.id}` },
  { name: "get account", method: "get", path: (o) => `/v1/accounts/${o.account.id}` },
  { name: "list contacts", method: "get", path: (o) => `/v1/accounts/${o.account.id}/contacts` },
  { name: "create contact", method: "post", path: (o) => `/v1/accounts/${o.account.id}/contacts`, body: { firstName: "Intruder" } },
  { name: "get contact", method: "get", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}` },
  { name: "update contact", method: "patch", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}`, body: { firstName: "Hacked" } },
  { name: "delete contact", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}` },
  { name: "list companies", method: "get", path: (o) => `/v1/accounts/${o.account.id}/companies` },
  { name: "create company", method: "post", path: (o) => `/v1/accounts/${o.account.id}/companies`, body: { name: "Intruder" } },
  { name: "get company", method: "get", path: (o) => `/v1/accounts/${o.account.id}/companies/${o.company.id}` },
  { name: "update company", method: "patch", path: (o) => `/v1/accounts/${o.account.id}/companies/${o.company.id}`, body: { name: "Hacked" } },
  { name: "delete company", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/companies/${o.company.id}` },
  { name: "list tags", method: "get", path: (o) => `/v1/accounts/${o.account.id}/tags` },
  { name: "create tag", method: "post", path: (o) => `/v1/accounts/${o.account.id}/tags`, body: { name: "Intruder" } },
  { name: "delete tag", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/tags/${o.tag.id}` },
  { name: "tag contact", method: "put", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}/tags/${o.tag.id}` },
  { name: "untag contact", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}/tags/${o.tag.id}` },
  { name: "list notes", method: "get", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}/notes` },
  { name: "create note", method: "post", path: (o) => `/v1/accounts/${o.account.id}/contacts/${o.contact.id}/notes`, body: { body: "Intruder" } },
  { name: "delete note", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/notes/${o.note.id}` },
  { name: "list custom fields", method: "get", path: (o) => `/v1/accounts/${o.account.id}/custom-fields` },
  { name: "create custom field", method: "post", path: (o) => `/v1/accounts/${o.account.id}/custom-fields`, body: { entity: "contact", label: "Intruder", type: "text" } },
  { name: "delete custom field", method: "delete", path: (o) => `/v1/accounts/${o.account.id}/custom-fields/${o.field.id}` },
];

// The quieter attack: the caller's own account in the address, another customer's record ID after it.
// The account check passes, so only the queries and the database stand in the way.
const MIXED: Action[] = [
  { name: "get their contact", method: "get", path: (o) => `/contacts/${o.contact.id}` },
  { name: "update their contact", method: "patch", path: (o) => `/contacts/${o.contact.id}`, body: { firstName: "Hacked" } },
  { name: "delete their contact", method: "delete", path: (o) => `/contacts/${o.contact.id}` },
  { name: "read their contact's notes", method: "get", path: (o) => `/contacts/${o.contact.id}/notes` },
  { name: "write a note on their contact", method: "post", path: (o) => `/contacts/${o.contact.id}/notes`, body: { body: "Intruder" } },
  { name: "delete their note", method: "delete", path: (o) => `/notes/${o.note.id}` },
  { name: "get their company", method: "get", path: (o) => `/companies/${o.company.id}` },
  { name: "update their company", method: "patch", path: (o) => `/companies/${o.company.id}`, body: { name: "Hacked" } },
  { name: "delete their company", method: "delete", path: (o) => `/companies/${o.company.id}` },
  { name: "delete their tag", method: "delete", path: (o) => `/tags/${o.tag.id}` },
  { name: "delete their custom field", method: "delete", path: (o) => `/custom-fields/${o.field.id}` },
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

  it.each(MIXED)("own account, their record: $name → 404", async (action) => {
    const res = await a.agent[action.method](`/v1/accounts/${a.account.id}${action.path(b)}`).send(action.body);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("own account, their record: cannot tag across accounts or move a contact into their company", async () => {
    const mine = `/v1/accounts/${a.account.id}`;
    await a.agent.put(`${mine}/contacts/${a.contact.id}/tags/${b.tag.id}`).expect(404);
    await a.agent.put(`${mine}/contacts/${b.contact.id}/tags/${a.tag.id}`).expect(404);
    const moved = await a.agent.patch(`${mine}/contacts/${a.contact.id}`).send({ companyId: b.company.id });
    expect(moved.status).toBe(422);
    expect(moved.body.code).toBe("company_not_found");
    // Exactly what a made-up company ID gets.
    const madeUp = await a.agent.patch(`${mine}/contacts/${a.contact.id}`).send({ companyId: crypto.randomUUID() });
    expect(madeUp.body).toEqual(moved.body);
    const filtered = await a.agent.get(`${mine}/contacts?companyId=${b.company.id}`).expect(200);
    expect(filtered.body.items).toEqual([]);
  });

  it("left agency B's data untouched and invisible", async () => {
    const theirs = `/v1/accounts/${b.account.id}`;
    expect((await b.agent.get(`${theirs}/contacts/${b.contact.id}`).expect(200)).body).toEqual(b.contact);
    expect((await b.agent.get(`${theirs}/companies`).expect(200)).body.items).toEqual([b.company]);
    expect((await b.agent.get(`${theirs}/tags`).expect(200)).body).toEqual([b.tag]);
    expect((await b.agent.get(`${theirs}/contacts/${b.contact.id}/notes`).expect(200)).body.items).toEqual([b.note]);
    expect((await b.agent.get(`${theirs}/custom-fields`).expect(200)).body).toEqual([b.field]);
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
