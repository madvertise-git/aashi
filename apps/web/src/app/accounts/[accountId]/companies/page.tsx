"use client";

import { createCompanyInput, type CreateCompanyInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError, QuietButton } from "@/components/ui";
import { client } from "@/lib/api";
import { keys, useAccount, useCompanies } from "@/lib/queries";

export default function CompaniesPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccount(accountId);
  const queryClient = useQueryClient();
  const companies = useCompanies(accountId);
  const form = useForm<z.input<typeof createCompanyInput>, unknown, CreateCompanyInput>({ resolver: zodResolver(createCompanyInput) });
  const { errors, isSubmitting } = form.formState;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.companies(accountId) }),
      queryClient.invalidateQueries({ queryKey: keys.contacts(accountId) }),
    ]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/accounts/{accountId}/companies", { params: { path: { accountId } }, body: values });
      form.reset();
      await refresh();
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

  async function remove(companyId: string, name: string) {
    if (!window.confirm(`Delete ${name}? Its contacts stay, without a company.`)) return;
    await client.DELETE("/v1/accounts/{accountId}/companies/{companyId}", { params: { path: { accountId, companyId } } }).catch(() => undefined);
    await refresh();
  }

  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      <p className="mb-2 text-sm">
        <Link className="text-brand underline" href={`/accounts/${accountId}`}>← Contacts</Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold">Companies</h1>
      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <Card>
          {companies.isPending ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : companies.isError ? (
            <FormError>{companies.error.message}</FormError>
          ) : companies.data.items.length === 0 ? (
            <Empty>No companies yet. Add the first one using the form.</Empty>
          ) : (
            <ul aria-label="Companies" className="divide-y divide-line">
              {companies.data.items.map((company) => (
                <li key={company.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium">{company.name}</span>{" "}
                    <span className="text-ink-muted">{[company.phone, company.website].filter(Boolean).join(" · ")}</span>
                  </span>
                  <QuietButton onClick={() => remove(company.id, company.name)}>
                    Delete<span className="sr-only"> {company.name}</span>
                  </QuietButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Add a company" className="self-start">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="Company name" error={errors.name?.message} {...form.register("name")} />
            <Field label="Website" type="url" placeholder="https://" error={errors.website?.message} {...form.register("website")} />
            <Field label="Company phone" type="tel" error={errors.phone?.message} {...form.register("phone")} />
            <FormError>{errors.root?.message}</FormError>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding…" : "Add company"}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
