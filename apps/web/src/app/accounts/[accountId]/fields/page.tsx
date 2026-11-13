"use client";

import type { CustomField } from "@aashi/contracts";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError, QuietButton, Select } from "@/components/ui";
import { ApiError, client } from "@/lib/api";
import { keys, useAccount, useCustomFields, useMe } from "@/lib/queries";

const TYPE_NAMES: Record<CustomField["type"], string> = { text: "Text", number: "Number", date: "Date", boolean: "Yes / No", select: "Choice from a list" };

export default function FieldsPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccount(accountId);
  const me = useMe();
  const role = me.data?.agencies.find((a) => a.id === account.data?.agencyId)?.role;
  const canManage = role === "owner" || role === "admin";
  const queryClient = useQueryClient();
  const fields = useCustomFields(accountId);
  const [entity, setEntity] = useState<CustomField["entity"]>("contact");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.customFields(accountId) }),
      queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) }),
    ]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const choices = options.split(",").map((o) => o.trim()).filter(Boolean);
      await client.POST("/v1/accounts/{accountId}/custom-fields", {
        params: { path: { accountId } },
        body: { entity, label, type, ...(type === "select" ? { options: choices } : {}) },
      });
      setLabel("");
      setOptions("");
      await refresh();
    } catch (e) {
      const first = e instanceof ApiError ? e.problem.errors?.[0]?.message : undefined;
      setError(first ?? (e instanceof Error ? e.message : "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: CustomField) {
    if (!window.confirm(`Delete "${field.label}"? Every value stored in it is deleted too. This cannot be undone.`)) return;
    await client.DELETE("/v1/accounts/{accountId}/custom-fields/{fieldId}", { params: { path: { accountId, fieldId: field.id } } }).catch(() => undefined);
    await refresh();
  }

  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      <p className="mb-2 text-sm">
        <Link className="text-brand underline" href={`/accounts/${accountId}`}>← Contacts</Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">Custom fields</h1>
      <p className="mb-6 text-sm text-ink-muted">Extra details this client wants to keep about contacts and companies.</p>
      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <Card>
          {fields.isPending ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : fields.isError ? (
            <FormError>{fields.error.message}</FormError>
          ) : fields.data.length === 0 ? (
            <Empty>No custom fields yet.</Empty>
          ) : (
            <ul aria-label="Custom fields" className="divide-y divide-line">
              {fields.data.map((field) => (
                <li key={field.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium">{field.label}</span>{" "}
                    <span className="text-ink-muted">
                      · {field.entity === "contact" ? "Contacts" : "Companies"} · {TYPE_NAMES[field.type]}
                      {field.options ? `: ${field.options.join(", ")}` : ""}
                    </span>
                  </span>
                  {canManage && (
                    <QuietButton onClick={() => remove(field)}>
                      Delete<span className="sr-only"> {field.label}</span>
                    </QuietButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canManage && (
          <Card title="Add a field" className="self-start">
            <form onSubmit={add} noValidate className="flex flex-col gap-4">
              <Select label="For" value={entity} onChange={(e) => setEntity(e.target.value as CustomField["entity"])}>
                <option value="contact">Contacts</option>
                <option value="company">Companies</option>
              </Select>
              <Field label="Field name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
              <Select label="Kind of answer" value={type} onChange={(e) => setType(e.target.value as CustomField["type"])}>
                {Object.entries(TYPE_NAMES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </Select>
              {type === "select" && (
                <Field label="Choices" hint="Separate with commas, e.g. Basic, Premium" value={options} onChange={(e) => setOptions(e.target.value)} />
              )}
              <FormError>{error}</FormError>
              <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add field"}</Button>
            </form>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
