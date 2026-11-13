import { createHmac, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Account, Agency, Contact, Invite } from "@aashi/contracts";
import { Mailer } from "../src/platform";
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
  /** An open invite to this agency. */
  invite: Invite;
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
  const invite = (
    await agent.post(`/v1/agencies/${agency.id}/invites`).send({ email: uniqueEmail(), role: "member" }).expect(201)
  ).body as Invite;
  return { agent, email, password, agency, account, contact, invite };
}

/** The code an authenticator app would show right now for this set-up link (RFC 6238, SHA-1, 6 digits, 30 s). */
export function totpCode(totpUri: string, at = Date.now()): string {
  const secret = new URL(totpUri).searchParams.get("secret") ?? "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** The secret from the most recent invite email sent to this address. */
export function inviteToken(app: INestApplication, email: string): string {
  const mail = app.get(Mailer).sent.findLast((m) => m.to === email.toLowerCase());
  const token = mail?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error(`No invite email was sent to ${email}`);
  return token;
}

/** A signed-in user who belongs to no agency yet. */
export async function createUser(app: INestApplication, email = uniqueEmail()) {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/v1/auth/sign-up").send({ name: "New Person", email, password: "correct horse battery" }).expect(201);
  return { agent, email };
}
