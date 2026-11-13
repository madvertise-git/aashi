// The rules both the screens and the server use to check data, plus the shapes
// the API returns. One set of rules, so the two can never disagree.
import { z } from "zod";

const name = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(120, `${label} is too long`);

export const signUpInput = z.object({
  name: name("Name"),
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export type SignUpInput = z.infer<typeof signUpInput>;

export const signInInput = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Password is required").max(200),
});
export type SignInInput = z.infer<typeof signInInput>;

/** A 6-digit authenticator code, or a backup code. */
export const codeInput = z.object({ code: z.string().trim().min(6, "Enter the code").max(32) });
export type CodeInput = z.infer<typeof codeInput>;

export const passwordInput = z.object({ password: z.string().min(1, "Password is required").max(200) });
export type PasswordInput = z.infer<typeof passwordInput>;

export const createAgencyInput = z.object({ name: name("Agency name") });
export type CreateAgencyInput = z.infer<typeof createAgencyInput>;

export const createAccountInput = z.object({ name: name("Client name") });
export type CreateAccountInput = z.infer<typeof createAccountInput>;

/** The owner role is given when an agency is created and cannot be handed out by invite. */
export const createInviteInput = z.object({
  email: z.email("Enter a valid email address").max(254),
  role: z.enum(["admin", "member"], "Choose a role"),
});
export type CreateInviteInput = z.infer<typeof createInviteInput>;

export const acceptInviteInput = z.object({ token: z.string().min(20).max(200) });
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

/**
 * Phones are stored in international format. A bare 10-digit Indian mobile
 * number is accepted and given +91; anything else must already start with +.
 */
export function normalisePhone(raw: string): string {
  const compact = raw.replace(/[\s\-().]/g, "");
  return /^[6-9]\d{9}$/.test(compact) ? `+91${compact}` : compact;
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Values for custom fields, keyed by the field's key. In an update, null clears a value. */
export const customValuesInput = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const createContactInput = z.object({
  firstName: name("First name"),
  lastName: z.preprocess(blankToUndefined, name("Last name").optional()),
  email: z.preprocess(blankToUndefined, z.email("Enter a valid email address").max(254).optional()),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? normalisePhone(v) : undefined),
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number with country code, e.g. +919876543210")
      .optional(),
  ),
  companyId: z.uuid().optional(),
  custom: customValuesInput.optional(),
});
export type CreateContactInput = z.infer<typeof createContactInput>;
/** What a form holds before the rules above tidy it up. */
export type CreateContactForm = z.input<typeof createContactInput>;

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const phoneRule = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number with country code, e.g. +919876543210");
const tidyPhone = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? normalisePhone(v) : blankToNull(v));

/** Only the fields sent are changed. Null (or a blank) clears a field that can be empty. */
export const updateContactInput = z.object({
  firstName: name("First name").optional(),
  lastName: z.preprocess(blankToNull, name("Last name").nullable().optional()),
  email: z.preprocess(blankToNull, z.email("Enter a valid email address").max(254).nullable().optional()),
  phone: z.preprocess(tidyPhone, phoneRule.nullable().optional()),
  companyId: z.uuid().nullable().optional(),
  custom: customValuesInput.optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactInput>;

const website = z.preprocess(blankToNull, z.url("Enter a full web address, e.g. https://example.com").max(300).nullable().optional());

export const createCompanyInput = z.object({
  name: name("Company name"),
  website,
  phone: z.preprocess(tidyPhone, phoneRule.nullable().optional()),
  custom: customValuesInput.optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanyInput>;

export const updateCompanyInput = createCompanyInput.partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanyInput>;

export const createTagInput = z.object({ name: z.string().trim().min(1, "Tag name is required").max(40, "Tag name is too long") });
export type CreateTagInput = z.infer<typeof createTagInput>;

export const createNoteInput = z.object({ body: z.string().trim().min(1, "Write something first").max(10_000, "That note is too long") });
export type CreateNoteInput = z.infer<typeof createNoteInput>;

export const customFieldType = z.enum(["text", "number", "date", "boolean", "select"]);
export const customFieldEntity = z.enum(["contact", "company"]);

export const createCustomFieldInput = z
  .object({
    entity: customFieldEntity,
    label: z.string().trim().min(1, "Label is required").max(60, "Label is too long"),
    type: customFieldType,
    /** The choices, for type "select". */
    options: z.array(z.string().trim().min(1).max(60)).min(1).max(50).optional(),
  })
  .refine((v) => (v.type === "select") === (v.options !== undefined), {
    path: ["options"],
    message: "Give the choices for a select field, and only for a select field",
  });
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldInput>;

export const listQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListQuery = z.infer<typeof listQuery>;

export const contactListQuery = listQuery.extend({
  /** Only contacts at this company. */
  companyId: z.uuid().optional(),
  /** Only contacts with this tag. */
  tagId: z.uuid().optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuery>;

// ---------------------------------------------------------------------------
// What the API returns. Written as rules too, so the OpenAPI contract
// (openapi.json) is generated from this file and nothing else.
// ---------------------------------------------------------------------------
const id = z.uuid();
const timestamp = z.iso.datetime();

export const role = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof role>;

export const user = z.object({ id, email: z.string(), name: z.string(), twoFactorEnabled: z.boolean() });
export type User = z.infer<typeof user>;

/** With two-factor on, the password is only step one: `user` is null until the code is verified. */
export const signInResult = z.object({ twoFactorRequired: z.boolean(), user: user.nullable() });
export type SignInResult = z.infer<typeof signInResult>;

/** Shown once when two-factor is set up: a link for the authenticator app, and one-time backup codes. */
export const twoFactorSetup = z.object({ totpUri: z.string(), backupCodes: z.array(z.string()) });
export type TwoFactorSetup = z.infer<typeof twoFactorSetup>;

export const agency = z.object({ id, name: z.string(), role });
export type Agency = z.infer<typeof agency>;

export const member = z.object({ userId: id, name: z.string(), email: z.string(), role });
export type Member = z.infer<typeof member>;

/** An invite that has not been accepted yet. */
export const invite = z.object({ id, email: z.string(), role: z.enum(["admin", "member"]), expiresAt: timestamp, createdAt: timestamp });
export type Invite = z.infer<typeof invite>;

export const account = z.object({ id, agencyId: id, name: z.string(), createdAt: timestamp });
export type Account = z.infer<typeof account>;

export const customValues = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const tag = z.object({ id, name: z.string() });
export type Tag = z.infer<typeof tag>;

export const contact = z.object({
  id,
  accountId: id,
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  companyId: id.nullable(),
  tags: z.array(tag),
  custom: customValues,
  createdAt: timestamp,
});
export type Contact = z.infer<typeof contact>;

export const company = z.object({
  id,
  accountId: id,
  name: z.string(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  custom: customValues,
  createdAt: timestamp,
});
export type Company = z.infer<typeof company>;

export const note = z.object({
  id,
  contactId: id,
  body: z.string(),
  /** Null when the author's user no longer exists. */
  authorId: id.nullable(),
  authorName: z.string().nullable(),
  createdAt: timestamp,
});
export type Note = z.infer<typeof note>;

export const customField = z.object({
  id,
  entity: customFieldEntity,
  /** The name used inside `custom`, made from the label when the field is created. */
  key: z.string(),
  label: z.string(),
  type: customFieldType,
  options: z.array(z.string()).nullable(),
});
export type CustomField = z.infer<typeof customField>;

export const me = z.object({ user, agencies: z.array(agency) });
export type Me = z.infer<typeof me>;

/** "Give me the next page after this one." nextCursor is null on the last page. */
export const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: id.nullable() });
export interface Page<T> { items: T[]; nextCursor: string | null }

/** Every error from the API has this shape (RFC 9457 "problem details"). */
export const problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof problem>;

export const health = z.object({ status: z.literal("ok") });
