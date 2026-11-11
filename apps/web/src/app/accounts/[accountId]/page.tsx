"use client";

import { type Contact, type CreateContactForm, createContactInput, type CreateContactInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError } from "@/components/ui";
import { api, ApiError, isNotFound } from "@/lib/api";
import { keys, useAccount, useContacts } from "@/lib/queries";

export default function AccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccount(accountId);
  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      {account.isError ? (
        <FormError>{isNotFound(account.error) ? "This client account does not exist, or you do not have access to it." : account.error.message}</FormError>
      ) : (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{account.data?.name ?? " "}</h1>
          <p className="mb-6 text-sm text-ink-muted">Contacts in this client account.</p>
          <Contacts accountId={accountId} />
        </>
      )}
    </AppShell>
  );
}

function Contacts({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const contacts = useContacts(accountId);
  const form = useForm<CreateContactForm, unknown, CreateContactInput>({ resolver: zodResolver(createContactInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await api<Contact>(`/v1/accounts/${accountId}/contacts`, { method: "POST", body: values });
      form.reset();
      await queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) });
    } catch (error) {
      if (error instanceof ApiError && error.code === "phone_taken") {
        form.setError("phone", { message: "A contact with this phone number already exists here." });
      } else {
        form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
      }
    }
  });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
      <Card title="Contacts">
        {contacts.isPending ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : contacts.isError ? (
          <FormError>{contacts.error.message}</FormError>
        ) : contacts.data.items.length === 0 ? (
          <Empty>No contacts yet. Add the first one using the form.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Phone</th>
                  <th scope="col" className="py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contacts.data.items.map((contact) => (
                  <tr key={contact.id}>
                    <td className="py-3 pr-4 font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(" ")}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{contact.phone ?? "—"}</td>
                    <td className="py-3">{contact.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Add a contact" className="self-start">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="First name" autoComplete="off" error={errors.firstName?.message} {...form.register("firstName")} />
          <Field label="Last name" autoComplete="off" error={errors.lastName?.message} {...form.register("lastName")} />
          <Field label="Phone" type="tel" autoComplete="off" hint="Indian mobile, or any number with country code." error={errors.phone?.message} {...form.register("phone")} />
          <Field label="Email" type="email" autoComplete="off" error={errors.email?.message} {...form.register("email")} />
          <FormError>{errors.root?.message}</FormError>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding…" : "Add contact"}</Button>
        </form>
      </Card>
    </div>
  );
}
