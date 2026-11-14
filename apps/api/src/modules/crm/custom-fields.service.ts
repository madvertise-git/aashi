import { Inject, Injectable } from "@nestjs/common";
import type { CreateCustomFieldInput, CustomField } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { requireRole } from "../tenancy";
import { DatabaseService, ProblemException, recordEvent, type Tx } from "../../platform";
import { type AccountTenant, isUniqueViolation, notFound } from "./shared";

type Entity = CustomField["entity"];
type Values = schema.CustomValues;
type ValuesInput = Record<string, string | number | boolean | null>;

const toField = (row: typeof schema.customFields.$inferSelect): CustomField => ({
  id: row.id,
  entity: row.entity,
  key: row.key,
  label: row.label,
  type: row.type,
  options: row.options ?? null,
});

/** "Monthly Budget (₹)" → "monthly_budget". */
function toKey(label: string): string {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(key) ? key : `f_${key}`.slice(0, 40).replace(/_+$/, "");
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Why a value does not suit a field, or undefined if it does. */
function problemWith(field: CustomField, value: string | number | boolean): string | undefined {
  switch (field.type) {
    case "text":
      return typeof value === "string" && value.length <= 2000 ? undefined : "must be text of at most 2000 characters";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "must be a number";
    case "boolean":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "date":
      return typeof value === "string" && isDate(value) ? undefined : "must be a date written YYYY-MM-DD";
    case "select":
      return typeof value === "string" && (field.options ?? []).includes(value) ? undefined : `must be one of: ${(field.options ?? []).join(", ")}`;
  }
}

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(tenant: AccountTenant): Promise<CustomField[]> {
    const rows = await this.database.withContext(tenant, (tx) =>
      tx
        .select()
        .from(schema.customFields)
        .where(eq(schema.customFields.accountId, tenant.accountId))
        .orderBy(asc(schema.customFields.id)),
    );
    return rows.map(toField);
  }

  async create(tenant: AccountTenant, input: CreateCustomFieldInput): Promise<CustomField> {
    requireRole(tenant, "admin");
    const key = toKey(input.label);
    if (!key) throw new ProblemException(422, "validation_failed", "The label needs at least one letter or digit.");
    try {
      return await this.database.withContext(tenant, async (tx) => {
        const [row] = await tx
          .insert(schema.customFields)
          .values({
            id: uuidv7(),
            agencyId: tenant.agencyId,
            accountId: tenant.accountId,
            entity: input.entity,
            key,
            label: input.label,
            type: input.type,
            options: input.options ? [...new Set(input.options)] : null,
          })
          .returning();
        if (!row) throw new Error("Custom field insert returned no row");
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "custom_field.created", payload: { fieldId: row.id, entity: row.entity, key } });
        return toField(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ProblemException(409, "field_exists", "A field with this name already exists.");
      throw error;
    }
  }

  /** Removes the definition and every value stored under its key. */
  async remove(tenant: AccountTenant, fieldId: string): Promise<void> {
    requireRole(tenant, "admin");
    await this.database.withContext(tenant, async (tx) => {
      const [field] = await tx
        .delete(schema.customFields)
        .where(and(eq(schema.customFields.id, fieldId), eq(schema.customFields.accountId, tenant.accountId)))
        .returning();
      if (!field) throw notFound();
      const table = field.entity === "contact" ? schema.contacts : schema.companies;
      await tx
        .update(table)
        .set({ custom: sql`${table.custom} - ${field.key}` })
        .where(and(eq(table.accountId, tenant.accountId), sql`${table.custom} ? ${field.key}`));
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "custom_field.deleted", payload: { fieldId, entity: field.entity, key: field.key } });
    });
  }

  /**
   * Checks incoming custom values against the account's field definitions and
   * merges them into what is already stored. Null removes a value. Unknown
   * keys and wrong types are refused, naming the field.
   */
  async merge(tx: Tx, tenant: AccountTenant, entity: Entity, current: Values, incoming: ValuesInput | undefined): Promise<Values> {
    if (!incoming || Object.keys(incoming).length === 0) return current;
    const rows = await tx
      .select()
      .from(schema.customFields)
      .where(and(eq(schema.customFields.accountId, tenant.accountId), eq(schema.customFields.entity, entity)));
    const fields = new Map(rows.map((row) => [row.key, toField(row)]));

    const next: Values = { ...current };
    const errors: { path: string; message: string }[] = [];
    for (const [key, value] of Object.entries(incoming)) {
      const field = fields.get(key);
      if (!field) {
        errors.push({ path: `custom.${key}`, message: "There is no such custom field." });
      } else if (value === null) {
        delete next[key];
      } else {
        const problem = problemWith(field, value);
        if (problem) errors.push({ path: `custom.${key}`, message: `${field.label} ${problem}.` });
        else next[key] = value;
      }
    }
    if (errors.length > 0) {
      throw new ProblemException(422, "validation_failed", errors.map((e) => e.message).join(" "), errors);
    }
    return next;
  }
}
