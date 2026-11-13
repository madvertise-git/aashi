// The API's contract. Every endpoint is listed once here; openapi.json, the
// web app's typed client and the API reference are all generated from it.
// A test in apps/api fails if this list and the real routes ever disagree.
import { z } from "zod";
import * as c from "./index";

type Method = "get" | "post" | "delete";

export interface Operation {
  method: Method;
  /** OpenAPI style, e.g. /v1/accounts/{accountId}/contacts */
  path: string;
  id: string;
  tag: "Health" | "Sign-in" | "Agencies" | "Team" | "Contacts";
  summary: string;
  /** False for the few routes that work without signing in. */
  auth?: boolean;
  body?: z.ZodType;
  query?: z.ZodObject;
  status: 200 | 201 | 204;
  /** Named response: [component name, rules]. Omit for 204. */
  response?: [name: string, schema: z.ZodType];
  /** Error statuses this route can answer with, beyond 401 (when auth) and 422 (when it takes input). */
  errors?: number[];
  rateLimited?: boolean;
}

const list = (name: string, item: z.ZodType): [string, z.ZodType] => [name, z.array(item)];

export const operations: Operation[] = [
  { method: "get", path: "/healthz", id: "live", tag: "Health", summary: "Is the process alive?", auth: false, status: 200, response: ["Health", c.health] },
  { method: "get", path: "/readyz", id: "ready", tag: "Health", summary: "Can it serve requests? Checks the database and Redis.", auth: false, status: 200, response: ["Health", c.health] },

  { method: "post", path: "/v1/auth/sign-up", id: "signUp", tag: "Sign-in", summary: "Create a user and sign them in.", auth: false, body: c.signUpInput, status: 201, response: ["User", c.user], errors: [409], rateLimited: true },
  { method: "post", path: "/v1/auth/sign-in", id: "signIn", tag: "Sign-in", summary: "Sign in with email and password. With two-factor on, a code must follow.", auth: false, body: c.signInInput, status: 200, response: ["SignInResult", c.signInResult], errors: [401], rateLimited: true },
  { method: "post", path: "/v1/auth/two-factor/verify", id: "verifyTwoFactor", tag: "Sign-in", summary: "Step two of signing in: an authenticator code or a backup code.", auth: false, body: c.codeInput, status: 200, response: ["User", c.user], errors: [401], rateLimited: true },
  { method: "post", path: "/v1/auth/two-factor/enable", id: "enableTwoFactor", tag: "Sign-in", summary: "Start two-factor set-up. Takes effect once confirmed.", body: c.passwordInput, status: 200, response: ["TwoFactorSetup", c.twoFactorSetup], rateLimited: true },
  { method: "post", path: "/v1/auth/two-factor/confirm", id: "confirmTwoFactor", tag: "Sign-in", summary: "Confirm set-up with a code from the authenticator app.", body: c.codeInput, status: 204, rateLimited: true },
  { method: "post", path: "/v1/auth/two-factor/disable", id: "disableTwoFactor", tag: "Sign-in", summary: "Switch two-factor off.", body: c.passwordInput, status: 204, rateLimited: true },
  { method: "post", path: "/v1/auth/sign-out", id: "signOut", tag: "Sign-in", summary: "End the session on the server.", status: 204 },
  { method: "get", path: "/v1/me", id: "me", tag: "Sign-in", summary: "The signed-in user and the agencies they belong to.", status: 200, response: ["Me", c.me] },

  { method: "post", path: "/v1/agencies", id: "createAgency", tag: "Agencies", summary: "Create an agency; the caller becomes its owner.", body: c.createAgencyInput, status: 201, response: ["Agency", c.agency] },
  { method: "get", path: "/v1/agencies/{agencyId}/accounts", id: "listAccounts", tag: "Agencies", summary: "The agency's client accounts.", status: 200, response: list("AccountList", c.account), errors: [404] },
  { method: "post", path: "/v1/agencies/{agencyId}/accounts", id: "createAccount", tag: "Agencies", summary: "Add a client account. Admins and owners only.", body: c.createAccountInput, status: 201, response: ["Account", c.account], errors: [403, 404] },
  { method: "get", path: "/v1/accounts/{accountId}", id: "getAccount", tag: "Agencies", summary: "One client account.", status: 200, response: ["Account", c.account], errors: [404] },

  { method: "get", path: "/v1/agencies/{agencyId}/members", id: "listMembers", tag: "Team", summary: "People in the agency.", status: 200, response: list("MemberList", c.member), errors: [404] },
  { method: "get", path: "/v1/agencies/{agencyId}/invites", id: "listInvites", tag: "Team", summary: "Invites not yet accepted. Admins and owners only.", status: 200, response: list("InviteList", c.invite), errors: [403, 404] },
  { method: "post", path: "/v1/agencies/{agencyId}/invites", id: "createInvite", tag: "Team", summary: "Invite someone by email. Admins and owners only.", body: c.createInviteInput, status: 201, response: ["Invite", c.invite], errors: [403, 404, 409], rateLimited: true },
  { method: "delete", path: "/v1/agencies/{agencyId}/invites/{inviteId}", id: "revokeInvite", tag: "Team", summary: "Cancel an open invite. Admins and owners only.", status: 204, errors: [403, 404] },
  { method: "post", path: "/v1/invites/accept", id: "acceptInvite", tag: "Team", summary: "Join the agency an invite link is for.", body: c.acceptInviteInput, status: 200, response: ["Agency", c.agency], errors: [404], rateLimited: true },

  { method: "get", path: "/v1/accounts/{accountId}/contacts", id: "listContacts", tag: "Contacts", summary: "Contacts in a client account, newest first.", query: c.listQuery, status: 200, response: ["ContactPage", c.page(c.contact)], errors: [404] },
  { method: "post", path: "/v1/accounts/{accountId}/contacts", id: "createContact", tag: "Contacts", summary: "Add a contact. A bare 10-digit Indian mobile number is stored with +91.", body: c.createContactInput, status: 201, response: ["Contact", c.contact], errors: [404, 409] },
];

type Json = Record<string, unknown>;

/** JSON Schema for a set of rules, as OpenAPI 3.1 wants it. */
function jsonSchema(schema: z.ZodType, io: "input" | "output"): Json {
  const json = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Json;
  delete json.$schema;
  // For input, the server tidies values before checking them (a bare Indian mobile number gains +91), so the
  // exact patterns would be stricter than what is really accepted.
  if (io === "input") strip(json, "pattern");
  return json;
}

function strip(node: unknown, key: string): void {
  if (Array.isArray(node)) node.forEach((n) => strip(n, key));
  else if (node && typeof node === "object") {
    delete (node as Json)[key];
    Object.values(node).forEach((n) => strip(n, key));
  }
}

const TITLES: Record<number, string> = {
  401: "Not signed in, or the sign-in details are wrong.",
  403: "Signed in, but this role may not do that.",
  404: "Not found. Other customers' data always looks like this.",
  409: "It already exists.",
  422: "The input failed validation; `errors` lists each problem.",
  429: "Too many requests. See the Retry-After header.",
};

export function buildOpenApiDocument(): Json {
  const schemas: Record<string, Json> = { Problem: jsonSchema(c.problem, "output") };
  const paths: Record<string, Record<string, Json>> = {};
  const problemResponse = (status: number): Json => ({
    description: TITLES[status],
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
  });

  for (const op of operations) {
    const auth = op.auth !== false;
    const statuses = new Set(op.errors ?? []);
    if (auth) statuses.add(401);
    if (op.body || op.query) statuses.add(422);
    if (op.rateLimited) statuses.add(429);

    const responses: Record<string, Json> = {};
    if (op.response) {
      const [name, schema] = op.response;
      schemas[name] ??= jsonSchema(schema, "output");
      responses[op.status] = {
        description: "Success.",
        content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
      };
    } else {
      responses[op.status] = { description: "Success. No content." };
    }
    for (const status of [...statuses].sort()) responses[status] = problemResponse(status);

    const parameters: Json[] = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    }));
    if (op.query) {
      const json = jsonSchema(op.query, "input") as { properties?: Record<string, Json>; required?: string[] };
      for (const [name, schema] of Object.entries(json.properties ?? {})) {
        parameters.push({ name, in: "query", required: json.required?.includes(name) ?? false, schema });
      }
    }

    (paths[op.path] ??= {})[op.method] = {
      operationId: op.id,
      tags: [op.tag],
      summary: op.summary,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(op.body
        ? { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(op.body, "input") } } } }
        : {}),
      responses,
      security: auth ? [{ session: [] }] : [],
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Aashi API",
      version: "1.0.0",
      description:
        "Addresses name the client account. Errors are RFC 9457 problem documents with a stable `code`. " +
        "Lists are paged with cursors. Rate-limited routes send RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset.",
    },
    servers: [{ url: "/api", description: "Through the web app" }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "aashi.session_token", description: "Set by sign-in." },
      },
    },
  };
}
