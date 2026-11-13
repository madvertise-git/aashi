"use client";

import { createNoteInput, type CreateNoteInput, type Contact, type CustomField } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError, QuietButton, Select } from "@/components/ui";
import { ApiError, client, isNotFound } from "@/lib/api";
import { keys, useAccount, useCompanies, useContact, useCustomFields, useMe, useNotes, useTags } from "@/lib/queries";

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

export default function ContactPage() {
  const { accountId, contactId } = useParams<{ accountId: string; contactId: string }>();
  const account = useAccount(accountId);
  const contact = useContact(accountId, contactId);
  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      {contact.isError ? (
        <FormError>{isNotFound(contact.error) ? "This contact does not exist, or you do not have access to it." : contact.error.message}</FormError>
      ) : !contact.data ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            <Link className="text-brand underline" href={`/accounts/${accountId}`}>← All contacts</Link>
          </p>
          <h1 className="mb-6 text-2xl font-semibold">{[contact.data.firstName, contact.data.lastName].filter(Boolean).join(" ")}</h1>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-6">
              {/* Remounts when the saved contact changes, so the form starts from what is stored. */}
              <Details key={JSON.stringify(contact.data)} accountId={accountId} contact={contact.data} />
              <Tags accountId={accountId} contact={contact.data} />
            </div>
            <Notes accountId={accountId} contactId={contactId} />
          </div>
        </>
      )}
    </AppShell>
  );
}

/** One input for a custom field, by its type. Values are kept as text until saved. */
function CustomInput({ field, value, onChange }: { field: CustomField; value: string; onChange: (value: string) => void }) {
  if (field.type === "select" || field.type === "boolean") {
    const options = field.type === "boolean" ? [["true", "Yes"], ["false", "No"]] : (field.options ?? []).map((o) => [o, o]);
    return (
      <Select label={field.label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </Select>
    );
  }
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return <Field label={field.label} type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function Details({ accountId, contact }: { accountId: string; contact: Contact }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const companies = useCompanies(accountId);
  const fields = useCustomFields(accountId);
  const contactFields = (fields.data ?? []).filter((f) => f.entity === "contact");
  const [values, setValues] = useState({
    firstName: contact.firstName,
    lastName: contact.lastName ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    companyId: contact.companyId ?? "",
  });
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(contact.custom).map(([key, value]) => [key, String(value)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value });

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setSaved(false);
    // Blank clears a value; numbers and yes/no go as their real types.
    const customBody = Object.fromEntries(
      contactFields.map((f) => {
        const raw = custom[f.key] ?? "";
        if (raw === "") return [f.key, null];
        return [f.key, f.type === "number" ? Number(raw) : f.type === "boolean" ? raw === "true" : raw];
      }),
    );
    try {
      await client.PATCH("/v1/accounts/{accountId}/contacts/{contactId}", {
        params: { path: { accountId, contactId: contact.id } },
        body: { ...values, companyId: values.companyId || null, custom: customBody },
      });
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) });
    } catch (error) {
      const problem = error instanceof ApiError ? error.problem : undefined;
      const byField = Object.fromEntries((problem?.errors ?? []).map((e) => [e.path, e.message]));
      if (problem?.code === "phone_taken") byField.phone = "A contact with this phone number already exists here.";
      setErrors(Object.keys(byField).length > 0 ? byField : { root: message(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this contact, with its notes and tags? This cannot be undone.")) return;
    await client.DELETE("/v1/accounts/{accountId}/contacts/{contactId}", { params: { path: { accountId, contactId: contact.id } } });
    await queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) });
    router.push(`/accounts/${accountId}`);
  }

  return (
    <Card title="Details">
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="First name" value={values.firstName} onChange={set("firstName")} error={errors.firstName} />
        <Field label="Last name" value={values.lastName} onChange={set("lastName")} error={errors.lastName} />
        <Field label="Phone" type="tel" value={values.phone} onChange={set("phone")} error={errors.phone} />
        <Field label="Email" type="email" value={values.email} onChange={set("email")} error={errors.email} />
        <Select label="Company" value={values.companyId} onChange={set("companyId")}>
          <option value="">No company</option>
          {companies.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {contactFields.map((field) => (
          <div key={field.id}>
            <CustomInput field={field} value={custom[field.key] ?? ""} onChange={(value) => setCustom({ ...custom, [field.key]: value })} />
            {errors[`custom.${field.key}`] && <p className="mt-1 text-xs text-danger">{errors[`custom.${field.key}`]}</p>}
          </div>
        ))}
        <FormError>{errors.root}</FormError>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          {saved && <span role="status" className="text-sm text-ink-muted">Saved.</span>}
          <QuietButton className="ml-auto text-danger" onClick={remove}>Delete contact</QuietButton>
        </div>
      </form>
    </Card>
  );
}

function Tags({ accountId, contact }: { accountId: string; contact: Contact }) {
  const queryClient = useQueryClient();
  const tags = useTags(accountId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const path = (tagId: string) => ({ params: { path: { accountId, contactId: contact.id, tagId } } });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) }),
      queryClient.invalidateQueries({ queryKey: keys.tags(accountId) }),
    ]);

  /** Adds the tag with this name, creating it first if the account does not have it yet. */
  async function add(event: FormEvent) {
    event.preventDefault();
    const wanted = name.trim();
    if (!wanted) return;
    setError(null);
    try {
      const existing = tags.data?.find((t) => t.name.toLowerCase() === wanted.toLowerCase());
      const tag = existing ?? (await client.POST("/v1/accounts/{accountId}/tags", { params: { path: { accountId } }, body: { name: wanted } })).data!;
      await client.PUT("/v1/accounts/{accountId}/contacts/{contactId}/tags/{tagId}", path(tag.id));
      setName("");
      await refresh();
    } catch (e) {
      setError(message(e));
    }
  }

  async function remove(tagId: string) {
    await client.DELETE("/v1/accounts/{accountId}/contacts/{contactId}/tags/{tagId}", path(tagId)).catch(() => undefined);
    await refresh();
  }

  return (
    <Card title="Tags">
      {contact.tags.length === 0 ? (
        <p className="mb-4 text-sm text-ink-muted">No tags yet.</p>
      ) : (
        <ul aria-label="Tags" className="mb-4 flex flex-wrap gap-2">
          {contact.tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1 rounded-full border border-line bg-canvas py-1 pl-3 pr-1 text-sm">
              {tag.name}
              <button className="rounded-full px-2 text-ink-muted hover:text-danger" onClick={() => remove(tag.id)} aria-label={`Remove tag ${tag.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Add a tag" list="account-tags" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} maxLength={40} />
          <datalist id="account-tags">{tags.data?.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </div>
        <Button type="submit">Add</Button>
      </form>
    </Card>
  );
}

function Notes({ accountId, contactId }: { accountId: string; contactId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const notes = useNotes(accountId, contactId);
  const form = useForm<CreateNoteInput>({ resolver: zodResolver(createNoteInput) });
  const { errors, isSubmitting } = form.formState;
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.notes(accountId, contactId) });

  const submit = form.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/accounts/{accountId}/contacts/{contactId}/notes", { params: { path: { accountId, contactId } }, body: values });
      form.reset();
      await refresh();
    } catch (error) {
      form.setError("root", { message: message(error) });
    }
  });

  async function remove(noteId: string) {
    try {
      await client.DELETE("/v1/accounts/{accountId}/notes/{noteId}", { params: { path: { accountId, noteId } } });
    } catch (error) {
      form.setError("root", { message: message(error) });
    }
    await refresh();
  }

  return (
    <Card title="Notes" className="self-start">
      <form onSubmit={submit} noValidate className="mb-5 flex flex-col gap-3">
        <label htmlFor="new-note" className="sr-only">New note</label>
        <textarea
          id="new-note"
          rows={3}
          placeholder="Write a note…"
          className={`rounded-md border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 ${errors.body ? "border-danger" : "border-line"}`}
          {...form.register("body")}
        />
        <FormError>{errors.body?.message ?? errors.root?.message}</FormError>
        <Button type="submit" disabled={isSubmitting} className="self-start">{isSubmitting ? "Saving…" : "Add note"}</Button>
      </form>
      {notes.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !notes.data || notes.data.items.length === 0 ? (
        <Empty>No notes yet.</Empty>
      ) : (
        <ul aria-label="Notes" className="flex flex-col gap-4">
          {notes.data.items.map((note) => (
            <li key={note.id} className="border-b border-line pb-4 text-sm last:border-0 last:pb-0">
              <p className="whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                <span>{note.authorName ?? "Former team member"} · {new Date(note.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                {note.authorId === me.data?.user.id && (
                  <button className="underline hover:text-danger" onClick={() => remove(note.id)}>Delete</button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
