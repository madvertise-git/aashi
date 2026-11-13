// CRM: editing contacts, companies, tags, notes and custom fields.
import type { INestApplication } from "@nestjs/common";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, inviteToken, startApp, type TenantFixture, uniqueEmail, uniquePhone } from "./helpers";

let app: INestApplication;
let t: TenantFixture;
let base: string;
beforeAll(async () => {
  app = await startApp();
  t = await createTenant(app, "CRM");
  base = `/v1/accounts/${t.account.id}`;
});
afterAll(() => app.close());

const newContact = async (body: Record<string, unknown> = {}) =>
  (await t.agent.post(`${base}/contacts`).send({ firstName: "Kavya", ...body }).expect(201)).body;

describe("contacts", () => {
  it("can be read, changed field by field, and deleted", async () => {
    const phone = uniquePhone();
    const contact = await newContact({ lastName: "Nair", email: "kavya@example.test", phone });
    expect((await t.agent.get(`${base}/contacts/${contact.id}`).expect(200)).body).toEqual(contact);

    // Only what is sent changes; a bare Indian mobile is tidied; null or a blank clears.
    const changed = (await t.agent.patch(`${base}/contacts/${contact.id}`).send({ firstName: "Kavya R", phone: "98111 22233" }).expect(200)).body;
    expect(changed).toMatchObject({ firstName: "Kavya R", lastName: "Nair", email: "kavya@example.test", phone: "+919811122233" });
    const cleared = (await t.agent.patch(`${base}/contacts/${contact.id}`).send({ lastName: null, email: "" }).expect(200)).body;
    expect(cleared).toMatchObject({ firstName: "Kavya R", lastName: null, email: null, phone: "+919811122233" });

    await t.agent.patch(`${base}/contacts/${contact.id}`).send({ email: "not-an-email" }).expect(422);
    await t.agent.patch(`${base}/contacts/${contact.id}`).send({ firstName: "" }).expect(422);

    await t.agent.delete(`${base}/contacts/${contact.id}`).expect(204);
    await t.agent.get(`${base}/contacts/${contact.id}`).expect(404);
    await t.agent.delete(`${base}/contacts/${contact.id}`).expect(404);
  });

  it("cannot be given a phone number another contact in the account already has", async () => {
    const phone = uniquePhone();
    await newContact({ phone });
    const other = await newContact();
    const res = await t.agent.patch(`${base}/contacts/${other.id}`).send({ phone });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("phone_taken");
  });
});

describe("companies", () => {
  it("can be created, changed and listed; contacts can be put in one and filtered by it", async () => {
    const company = (await t.agent.post(`${base}/companies`).send({ name: "Lotus Clinics", website: "https://lotus.example.test", phone: "022 4000 1234".replace(/ /g, "").replace(/^0/, "+91") }).expect(201)).body;
    expect(company).toMatchObject({ name: "Lotus Clinics", website: "https://lotus.example.test", phone: "+912240001234", custom: {} });
    await t.agent.post(`${base}/companies`).send({ name: "Bad", website: "lotus" }).expect(422);

    const renamed = (await t.agent.patch(`${base}/companies/${company.id}`).send({ name: "Lotus Health", website: null }).expect(200)).body;
    expect(renamed).toMatchObject({ name: "Lotus Health", website: null, phone: "+912240001234" });

    const inside = await newContact({ companyId: company.id });
    const outside = await newContact();
    expect(inside.companyId).toBe(company.id);
    const moved = (await t.agent.patch(`${base}/contacts/${outside.id}`).send({ companyId: company.id }).expect(200)).body;
    expect(moved.companyId).toBe(company.id);
    const atCompany = (await t.agent.get(`${base}/contacts?companyId=${company.id}`).expect(200)).body.items;
    expect(atCompany.map((c: { id: string }) => c.id).sort()).toEqual([inside.id, outside.id].sort());

    await t.agent.post(`${base}/contacts`).send({ firstName: "X", companyId: crypto.randomUUID() }).expect(422);
  });

  it("deleting a company keeps its people, without a company", async () => {
    const company = (await t.agent.post(`${base}/companies`).send({ name: "Closing Down Ltd" }).expect(201)).body;
    const contact = await newContact({ companyId: company.id });
    await t.agent.delete(`${base}/companies/${company.id}`).expect(204);
    await t.agent.get(`${base}/companies/${company.id}`).expect(404);
    expect((await t.agent.get(`${base}/contacts/${contact.id}`).expect(200)).body.companyId).toBeNull();
  });

  it("pages with a cursor, newest first", async () => {
    for (const name of ["Page One", "Page Two", "Page Three"]) await t.agent.post(`${base}/companies`).send({ name }).expect(201);
    const first = (await t.agent.get(`${base}/companies?limit=2`).expect(200)).body;
    expect(first.items.map((c: { name: string }) => c.name)).toEqual(["Page Three", "Page Two"]);
    const next = (await t.agent.get(`${base}/companies?limit=1&cursor=${first.nextCursor}`).expect(200)).body;
    expect(next.items[0].name).toBe("Page One");
  });
});

describe("tags", () => {
  it("are unique by name whatever the capitals, and listed by name", async () => {
    await t.agent.post(`${base}/tags`).send({ name: "Hot lead" }).expect(201);
    const dupe = await t.agent.post(`${base}/tags`).send({ name: "HOT LEAD" });
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe("tag_exists");
    await t.agent.post(`${base}/tags`).send({ name: " " }).expect(422);
    const names = (await t.agent.get(`${base}/tags`).expect(200)).body.map((x: { name: string }) => x.name);
    expect(names).toEqual([...names].sort((x: string, y: string) => x.toLowerCase().localeCompare(y.toLowerCase())));
  });

  it("go on and come off contacts, show on the contact, and filter the list", async () => {
    const tag = (await t.agent.post(`${base}/tags`).send({ name: "Follow up" }).expect(201)).body;
    const tagged = await newContact();
    const untagged = await newContact();
    await t.agent.put(`${base}/contacts/${tagged.id}/tags/${tag.id}`).expect(204);
    await t.agent.put(`${base}/contacts/${tagged.id}/tags/${tag.id}`).expect(204); // twice is harmless
    await t.agent.put(`${base}/contacts/${tagged.id}/tags/${t.tag.id}`).expect(204);

    const read = (await t.agent.get(`${base}/contacts/${tagged.id}`).expect(200)).body;
    expect(read.tags).toEqual([t.tag, tag].sort((x, y) => x.name.localeCompare(y.name)));
    const filtered = (await t.agent.get(`${base}/contacts?tagId=${tag.id}`).expect(200)).body.items;
    expect(filtered.map((c: { id: string }) => c.id)).toEqual([tagged.id]);
    expect(filtered[0].tags).toHaveLength(2);
    expect(filtered.map((c: { id: string }) => c.id)).not.toContain(untagged.id);

    await t.agent.delete(`${base}/contacts/${tagged.id}/tags/${tag.id}`).expect(204);
    await t.agent.delete(`${base}/contacts/${tagged.id}/tags/${tag.id}`).expect(404);
    await t.agent.put(`${base}/contacts/${tagged.id}/tags/${crypto.randomUUID()}`).expect(404);
  });

  it("tagging the same contact twice records one event, so automations fire once", async () => {
    const tag = (await t.agent.post(`${base}/tags`).send({ name: "Once only" }).expect(201)).body;
    const contact = await newContact();
    await t.agent.put(`${base}/contacts/${contact.id}/tags/${tag.id}`).expect(204);
    await t.agent.put(`${base}/contacts/${contact.id}/tags/${tag.id}`).expect(204);
    const owner = new pg.Client(process.env.TEST_DATABASE_OWNER_URL ?? "postgres://platform_owner:owner_dev_password@localhost:5432/aashi_test");
    await owner.connect();
    try {
      await owner.query("BEGIN");
      await owner.query("SELECT set_config('app.agency_id', $1, true)", [t.agency.id]);
      await owner.query("CREATE POLICY outbox_test_read ON outbox FOR SELECT USING (agency_id = app_agency_id())");
      const { rows } = await owner.query("SELECT count(*)::int AS n FROM outbox WHERE event_type = 'contact.tagged' AND payload->>'tagId' = $1", [tag.id]);
      expect(rows[0].n).toBe(1);
    } finally {
      await owner.query("ROLLBACK");
      await owner.end();
    }
  });

  it("deleting a tag takes it off every contact", async () => {
    const tag = (await t.agent.post(`${base}/tags`).send({ name: "Temporary" }).expect(201)).body;
    const contact = await newContact();
    await t.agent.put(`${base}/contacts/${contact.id}/tags/${tag.id}`).expect(204);
    await t.agent.delete(`${base}/tags/${tag.id}`).expect(204);
    expect((await t.agent.get(`${base}/contacts/${contact.id}`).expect(200)).body.tags).toEqual([]);
  });
});

describe("notes", () => {
  it("are written on a contact, listed newest first with the author's name, and go when the contact goes", async () => {
    const contact = await newContact();
    const first = (await t.agent.post(`${base}/contacts/${contact.id}/notes`).send({ body: "  Called, asked for a quote.  " }).expect(201)).body;
    expect(first).toMatchObject({ contactId: contact.id, body: "Called, asked for a quote.", authorName: "CRM Owner" });
    await t.agent.post(`${base}/contacts/${contact.id}/notes`).send({ body: "Sent the quote." }).expect(201);
    await t.agent.post(`${base}/contacts/${contact.id}/notes`).send({ body: "" }).expect(422);
    await t.agent.post(`${base}/contacts/${contact.id}/notes`).send({ body: "x".repeat(10_001) }).expect(422);

    const page = (await t.agent.get(`${base}/contacts/${contact.id}/notes?limit=1`).expect(200)).body;
    expect(page.items.map((n: { body: string }) => n.body)).toEqual(["Sent the quote."]);
    const rest = (await t.agent.get(`${base}/contacts/${contact.id}/notes?cursor=${page.nextCursor}`).expect(200)).body;
    expect(rest.items).toEqual([first]);

    await t.agent.delete(`${base}/contacts/${contact.id}`).expect(204);
    await t.agent.get(`${base}/contacts/${contact.id}/notes`).expect(404);
    await t.agent.delete(`${base}/notes/${first.id}`).expect(404);
  });

  it("can be deleted by their author or an admin, but not by another member", async () => {
    const join = async (role: string) => {
      const email = uniqueEmail();
      await t.agent.post(`/v1/agencies/${t.agency.id}/invites`).send({ email, role }).expect(201);
      const person = await createUser(app, email);
      await person.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(200);
      return person.agent;
    };
    const member = await join("member");
    const otherMember = await join("member");
    const contact = await newContact();
    const write = async () => (await member.post(`${base}/contacts/${contact.id}/notes`).send({ body: "Mine" }).expect(201)).body.id as string;

    const one = await write();
    const refused = await otherMember.delete(`${base}/notes/${one}`);
    expect(refused.status).toBe(403);
    await member.delete(`${base}/notes/${one}`).expect(204);
    await t.agent.delete(`${base}/notes/${await write()}`).expect(204); // the owner
  });
});

describe("custom fields", () => {
  it("are defined per account by an admin, with a key made from the label", async () => {
    const field = (await t.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "Monthly Budget (₹)", type: "number" }).expect(201)).body;
    expect(field).toMatchObject({ entity: "contact", key: "monthly_budget", label: "Monthly Budget (₹)", type: "number", options: null });
    const dupe = await t.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "monthly budget", type: "text" });
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe("field_exists");
    // The same label is fine for companies: they are separate lists.
    await t.agent.post(`${base}/custom-fields`).send({ entity: "company", label: "Monthly Budget (₹)", type: "number" }).expect(201);
    // A select needs its choices; other types must not have any.
    await t.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "Plan", type: "select" }).expect(422);
    await t.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "Plan", type: "text", options: ["a"] }).expect(422);
  });

  it("values are checked against the field's type, merged key by key, and cleared with null", async () => {
    for (const body of [
      { entity: "contact", label: "City", type: "text" },
      { entity: "contact", label: "Visits", type: "number" },
      { entity: "contact", label: "Next visit", type: "date" },
      { entity: "contact", label: "Insured", type: "boolean" },
      { entity: "contact", label: "Plan", type: "select", options: ["Basic", "Premium"] },
    ]) {
      await t.agent.post(`${base}/custom-fields`).send(body).expect(201);
    }
    const contact = await newContact({ custom: { city: "Pune", visits: 3 } });
    expect(contact.custom).toEqual({ city: "Pune", visits: 3 });

    const merged = (await t.agent.patch(`${base}/contacts/${contact.id}`).send({ custom: { next_visit: "2026-12-01", insured: true, plan: "Premium", visits: null } }).expect(200)).body;
    expect(merged.custom).toEqual({ city: "Pune", next_visit: "2026-12-01", insured: true, plan: "Premium" });
    // Changing something else leaves custom values alone.
    expect((await t.agent.patch(`${base}/contacts/${contact.id}`).send({ firstName: "Kavya S" }).expect(200)).body.custom).toEqual(merged.custom);

    const bad = await t.agent.patch(`${base}/contacts/${contact.id}`).send({
      custom: { visits: "three", next_visit: "01/12/2026", insured: "yes", plan: "Gold", shoe_size: 7 },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("validation_failed");
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(
      ["custom.insured", "custom.next_visit", "custom.plan", "custom.shoe_size", "custom.visits"],
    );
    // Nothing was half-saved.
    expect((await t.agent.get(`${base}/contacts/${contact.id}`).expect(200)).body.custom).toEqual(merged.custom);
    // A contact field cannot be set on a company.
    await t.agent.post(`${base}/companies`).send({ name: "X", custom: { city: "Pune" } }).expect(422);
  });

  it("deleting a field removes its values everywhere", async () => {
    const field = (await t.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "Referred by", type: "text" }).expect(201)).body;
    const contact = await newContact({ custom: { referred_by: "Dr Rao" } });
    await t.agent.delete(`${base}/custom-fields/${field.id}`).expect(204);
    expect((await t.agent.get(`${base}/contacts/${contact.id}`).expect(200)).body.custom).not.toHaveProperty("referred_by");
    await t.agent.patch(`${base}/contacts/${contact.id}`).send({ custom: { referred_by: "Dr Rao" } }).expect(422);
    await t.agent.delete(`${base}/custom-fields/${field.id}`).expect(404);
  });

  it("members can use fields but only admins and owners can define or delete them", async () => {
    const email = uniqueEmail();
    await t.agent.post(`/v1/agencies/${t.agency.id}/invites`).send({ email, role: "member" }).expect(201);
    const member = await createUser(app, email);
    await member.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(200);
    await member.agent.get(`${base}/custom-fields`).expect(200);
    await member.agent.post(`${base}/custom-fields`).send({ entity: "contact", label: "Nope", type: "text" }).expect(403);
    await member.agent.delete(`${base}/custom-fields/${t.field.id}`).expect(403);
  });
});
