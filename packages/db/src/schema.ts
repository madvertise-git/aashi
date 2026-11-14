// Typed view of the tables for queries. The SQL in migrations/ is the source of
// truth (it also holds the security policies); keep the two in step.
// The sign-in tables (sessions, auth_*) belong to Better Auth and are not listed here.
import { boolean, customType, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
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
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
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
