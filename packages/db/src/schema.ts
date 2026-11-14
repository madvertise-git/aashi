// Typed view of the tables for queries. The SQL in migrations/ is the source of
// truth (it also holds the security policies); keep the two in step.
// The sign-in tables (sessions, auth_*) belong to Better Auth and are not listed here.
import { boolean, customType, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
/** Custom field values on a contact or company, keyed by the field's key. */
export type CustomValues = Record<string, string | number | boolean>;
const utc = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: citext("email").notNull(),
  name: text("name").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  email: citext("email").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by"),
  expiresAt: utc("expires_at").notNull(),
  acceptedAt: utc("accepted_at"),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  name: text("name").notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: citext("email"),
  phone: text("phone"),
  companyId: uuid("company_id"),
  custom: jsonb("custom").$type<CustomValues>().notNull().default({}),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  name: text("name").notNull(),
  website: text("website"),
  phone: text("phone"),
  custom: jsonb("custom").$type<CustomValues>().notNull().default({}),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  name: citext("name").notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const contactTags = pgTable("contact_tags", {
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  tagId: uuid("tag_id").notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  body: text("body").notNull(),
  authorId: uuid("author_id"),
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

export const customFields = pgTable("custom_fields", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id").notNull(),
  entity: text("entity", { enum: ["contact", "company"] }).notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type", { enum: ["text", "number", "date", "boolean", "select"] }).notNull(),
  options: jsonb("options").$type<string[]>(),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey(),
  agencyId: uuid("agency_id").notNull(),
  accountId: uuid("account_id"),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: utc("created_at").notNull().defaultNow(),
  publishedAt: utc("published_at"),
});
