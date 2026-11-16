// Pipelines, deals and the dashboard numbers built from them.
import type { INestApplication } from "@nestjs/common";
import type { Deal } from "@aashi/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, inviteToken, startApp, type TenantFixture, uniqueEmail } from "./helpers";

let app: INestApplication;
let t: TenantFixture;
let base: string;
let stages: { id: string; name: string; kind: string }[];
beforeAll(async () => {
  app = await startApp();
  t = await createTenant(app, "Pipe");
  base = `/v1/accounts/${t.account.id}`;
  stages = t.pipeline.stages;
});
afterAll(() => app.close());

const stage = (name: string) => stages.find((s) => s.name === name)!.id;
const newDeal = async (body: Record<string, unknown> = {}) =>
  (await t.agent.post(`${base}/deals`).send({ pipelineId: t.pipeline.id, stageId: stage("New lead"), title: "Whitening package", ...body }).expect(201)).body as Deal;
const board = async () => (await t.agent.get(`${base}/pipelines/${t.pipeline.id}/deals`).expect(200)).body as Deal[];

describe("pipelines", () => {
  it("start with the standard stages, left to right, ending in won and lost", async () => {
    expect(stages.map((s) => [s.name, s.kind])).toEqual([
      ["New lead", "open"],
      ["Contacted", "open"],
      ["Qualified", "open"],
      ["Proposal sent", "open"],
      ["Won", "won"],
      ["Lost", "lost"],
    ]);
    expect((await t.agent.get(`${base}/pipelines`).expect(200)).body).toEqual([t.pipeline]);
  });

  it("can only be created by an admin or owner", async () => {
    const email = uniqueEmail();
    await t.agent.post(`/v1/agencies/${t.agency.id}/invites`).send({ email, role: "member" }).expect(201);
    const member = await createUser(app, email);
    await member.agent.post("/v1/invites/accept").send({ token: inviteToken(app, email) }).expect(200);
    await member.agent.post(`${base}/pipelines`).send({ name: "Nope" }).expect(403);
    // Members do work the board.
    await member.agent.post(`${base}/deals`).send({ pipelineId: t.pipeline.id, stageId: stage("New lead"), title: "Member's deal" }).expect(201);
  });
});

describe("deals", () => {
  it("carry a value in whole paise and the contact's name", async () => {
    expect(t.deal).toMatchObject({ title: "Pipe deal", valueMinor: 5_000_000, currency: "INR", contactId: t.contact.id, contactName: "Pipe Contact", closedAt: null });
    const plain = await newDeal();
    expect(plain).toMatchObject({ valueMinor: 0, contactId: null, contactName: null });
    await t.agent.post(`${base}/deals`).send({ pipelineId: t.pipeline.id, stageId: stage("New lead"), title: "x", valueMinor: 1999.5 }).expect(422);
    await t.agent.post(`${base}/deals`).send({ pipelineId: t.pipeline.id, stageId: stage("New lead"), title: "x", valueMinor: -1 }).expect(422);
    await t.agent.post(`${base}/deals`).send({ pipelineId: t.pipeline.id, stageId: stage("New lead"), title: "" }).expect(422);
  });

  it("a new deal goes to the bottom of its stage, and can be dropped between two others", async () => {
    const one = await newDeal({ title: "One", stageId: stage("Qualified") });
    const two = await newDeal({ title: "Two", stageId: stage("Qualified") });
    const three = await newDeal({ title: "Three", stageId: stage("Qualified") });
    const inStage = async () => (await board()).filter((d) => d.stageId === stage("Qualified")).map((d) => d.title);
    expect(await inStage()).toEqual(["One", "Two", "Three"]);

    await t.agent.patch(`${base}/deals/${three.id}`).send({ position: (one.position + two.position) / 2 }).expect(200);
    expect(await inStage()).toEqual(["One", "Three", "Two"]);
  });

  it("moving to Won or Lost closes a deal; moving back reopens it", async () => {
    const deal = await newDeal({ valueMinor: 2_500_000 });
    const won = (await t.agent.patch(`${base}/deals/${deal.id}`).send({ stageId: stage("Won") }).expect(200)).body;
    expect(won.stageId).toBe(stage("Won"));
    expect(won.closedAt).toEqual(expect.any(String));
    const reopened = (await t.agent.patch(`${base}/deals/${deal.id}`).send({ stageId: stage("Contacted") }).expect(200)).body;
    expect(reopened.closedAt).toBeNull();
    const lost = (await t.agent.patch(`${base}/deals/${deal.id}`).send({ stageId: stage("Lost") }).expect(200)).body;
    expect(lost.closedAt).toEqual(expect.any(String));
  });

  it("can be edited and deleted; a made-up stage is refused", async () => {
    const deal = await newDeal();
    const edited = (await t.agent.patch(`${base}/deals/${deal.id}`).send({ title: "Braces", valueMinor: 8_000_000, contactId: t.contact.id }).expect(200)).body;
    expect(edited).toMatchObject({ title: "Braces", valueMinor: 8_000_000, contactName: "Pipe Contact", stageId: deal.stageId });
    const bad = await t.agent.patch(`${base}/deals/${deal.id}`).send({ stageId: crypto.randomUUID() });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("stage_not_found");
    await t.agent.delete(`${base}/deals/${deal.id}`).expect(204);
    await t.agent.delete(`${base}/deals/${deal.id}`).expect(404);
    await t.agent.patch(`${base}/deals/${deal.id}`).send({ title: "x" }).expect(404);
  });

  it("deleting a contact keeps their deal, without a contact", async () => {
    const contact = (await t.agent.post(`${base}/contacts`).send({ firstName: "Leaving" }).expect(201)).body;
    const deal = await newDeal({ contactId: contact.id });
    await t.agent.delete(`${base}/contacts/${contact.id}`).expect(204);
    expect((await board()).find((d) => d.id === deal.id)).toMatchObject({ contactId: null, contactName: null });
  });
});

describe("dashboard numbers", () => {
  it("a fresh account is all zeros, with every one of the last 14 days listed", async () => {
    const fresh = (await t.agent.post(`/v1/agencies/${t.agency.id}/accounts`).send({ name: "Fresh" }).expect(201)).body;
    const summary = (await t.agent.get(`/v1/accounts/${fresh.id}/summary`).expect(200)).body;
    expect(summary).toMatchObject({
      contacts: { total: 0, last7Days: 0, previous7Days: 0 },
      companies: 0,
      deals: { open: { count: 0, valueMinor: 0 }, won: { count: 0, valueMinor: 0 }, lost: { count: 0, valueMinor: 0 } },
      stages: [],
      recentContacts: [],
      recentDeals: [],
    });
    expect(summary.contactsByDay).toHaveLength(14);
    expect(summary.contactsByDay.every((d: { count: number }) => d.count === 0)).toBe(true);
  });

  it("count contacts and add up deals by stage, open, won and lost", async () => {
    const account = (await t.agent.post(`/v1/agencies/${t.agency.id}/accounts`).send({ name: "Counted" }).expect(201)).body;
    const at = `/v1/accounts/${account.id}`;
    for (const firstName of ["Asha", "Bhavna", "Chirag"]) await t.agent.post(`${at}/contacts`).send({ firstName }).expect(201);
    await t.agent.post(`${at}/companies`).send({ name: "Counted Co" }).expect(201);
    const pipeline = (await t.agent.post(`${at}/pipelines`).send({ name: "Sales" }).expect(201)).body;
    const id = (name: string) => pipeline.stages.find((s: { name: string }) => s.name === name).id;
    const add = (title: string, stageName: string, valueMinor: number) =>
      t.agent.post(`${at}/deals`).send({ pipelineId: pipeline.id, stageId: id(stageName), title, valueMinor }).expect(201);
    await add("A", "New lead", 1_000_000);
    await add("B", "New lead", 2_000_000);
    await add("C", "Proposal sent", 4_000_000);
    await add("D", "Won", 7_000_000);
    await add("E", "Lost", 9_000_000);

    const summary = (await t.agent.get(`${at}/summary`).expect(200)).body;
    expect(summary.contacts).toEqual({ total: 3, last7Days: 3, previous7Days: 0 });
    expect(summary.companies).toBe(1);
    expect(summary.deals).toEqual({
      open: { count: 3, valueMinor: 7_000_000 },
      won: { count: 1, valueMinor: 7_000_000 },
      lost: { count: 1, valueMinor: 9_000_000 },
    });
    expect(summary.stages.map((s: { name: string; count: number; valueMinor: number }) => [s.name, s.count, s.valueMinor])).toEqual([
      ["New lead", 2, 3_000_000],
      ["Contacted", 0, 0],
      ["Qualified", 0, 0],
      ["Proposal sent", 1, 4_000_000],
      ["Won", 1, 7_000_000],
      ["Lost", 1, 9_000_000],
    ]);
    expect(summary.contactsByDay.at(-1).count).toBe(3);
    expect(summary.recentContacts.map((c: { name: string }) => c.name)).toEqual(["Chirag", "Bhavna", "Asha"]);
    expect(summary.recentDeals).toHaveLength(5);

    // The agency's home page shows the same totals for this account.
    const agency = (await t.agent.get(`/v1/agencies/${t.agency.id}/summary`).expect(200)).body;
    expect(agency.accounts.find((a: { id: string }) => a.id === account.id)).toMatchObject({
      name: "Counted",
      contacts: 3,
      openDeals: 3,
      openValueMinor: 7_000_000,
      wonValueMinor: 7_000_000,
    });
    expect(agency.members).toBeGreaterThanOrEqual(1);
  });
});
