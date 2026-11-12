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

export const createAgencyInput = z.object({ name: name("Agency name") });
export type CreateAgencyInput = z.infer<typeof createAgencyInput>;

export const createAccountInput = z.object({ name: name("Client name") });
export type CreateAccountInput = z.infer<typeof createAccountInput>;

/**
 * Phones are stored in international format. A bare 10-digit Indian mobile
 * number is accepted and given +91; anything else must already start with +.
 */
export function normalisePhone(raw: string): string {
  const compact = raw.replace(/[\s\-().]/g, "");
  return /^[6-9]\d{9}$/.test(compact) ? `+91${compact}` : compact;
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

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
});
export type CreateContactInput = z.infer<typeof createContactInput>;
/** What a form holds before the rules above tidy it up. */
export type CreateContactForm = z.input<typeof createContactInput>;

export const listQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListQuery = z.infer<typeof listQuery>;

export type Role = "owner" | "admin" | "member";
export interface User { id: string; email: string; name: string }
export interface Agency { id: string; name: string; role: Role }
export interface Account { id: string; agencyId: string; name: string; createdAt: string }
export interface Contact {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
}
export interface Me { user: User; agencies: Agency[] }
/** "Give me the next page after this one." nextCursor is null on the last page. */
export interface Page<T> { items: T[]; nextCursor: string | null }

/** Every error from the API has this shape (RFC 9457 "problem details"). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { path: string; message: string }[];
}
