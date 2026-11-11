import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Account, Agency, Contact } from "@aashi/contracts";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { createApp } from "../src/app";

export async function startApp(): Promise<INestApplication> {
  const app = await createApp();
  app.useLogger(false);
  await app.init();
  return app;
}

/** A signed-in user with their own agency, client account and one contact. */
export interface TenantFixture {
  agent: TestAgent;
  email: string;
  password: string;
  agency: Agency;
  account: Account;
  contact: Contact;
}

export const uniqueEmail = () => `user-${randomUUID()}@example.test`;
/** A random, valid Indian mobile number. */
export const uniquePhone = () => `+919${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;

export async function createTenant(app: INestApplication, label: string): Promise<TenantFixture> {
  const agent = request.agent(app.getHttpServer());
  const email = uniqueEmail();
  const password = "correct horse battery";
  await agent.post("/v1/auth/sign-up").send({ name: `${label} Owner`, email, password }).expect(201);
  const agency = (await agent.post("/v1/agencies").send({ name: `${label} Agency` }).expect(201)).body as Agency;
  const account = (
    await agent.post(`/v1/agencies/${agency.id}/accounts`).send({ name: `${label} Client` }).expect(201)
  ).body as Account;
  const contact = (
    await agent
      .post(`/v1/accounts/${account.id}/contacts`)
      .send({ firstName: label, lastName: "Contact", phone: uniquePhone() })
      .expect(201)
  ).body as Contact;
  return { agent, email, password, agency, account, contact };
}
