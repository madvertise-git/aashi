"use client";

import { createAccountInput, type CreateAccountInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError } from "@/components/ui";
import { client, isNotFound } from "@/lib/api";
import { keys, useAccounts, useMe } from "@/lib/queries";

export default function AgencyPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  return (
    <AppShell agencyId={agencyId}>
      <Accounts agencyId={agencyId} />
    </AppShell>
  );
}

function Accounts({ agencyId }: { agencyId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const accounts = useAccounts(agencyId);
  const agency = me.data?.agencies.find((a) => a.id === agencyId);
  const canManage = agency?.role === "owner" || agency?.role === "admin";
  const form = useForm<CreateAccountInput>({ resolver: zodResolver(createAccountInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/agencies/{agencyId}/accounts", { params: { path: { agencyId } }, body: values });
      form.reset();
      await queryClient.invalidateQueries({ queryKey: keys.accounts(agencyId) });
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

  if (accounts.isError) return <FormError>{isNotFound(accounts.error) ? "This agency does not exist, or you do not have access to it." : accounts.error.message}</FormError>;

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{agency?.name ?? "Agency"}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Each client account keeps one client’s contacts and data separate.{" "}
        <Link className="text-brand underline" href={`/agencies/${agencyId}/team`}>Team</Link>
      </p>
      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <Card title="Client accounts">
          {accounts.isPending ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : accounts.data.length === 0 ? (
            <Empty>No client accounts yet. Add your first client to get started.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {accounts.data.map((account) => (
                <li key={account.id}>
                  <Link href={`/accounts/${account.id}`} className="flex items-center justify-between py-3 text-sm hover:text-brand">
                    <span className="font-medium">{account.name}</span>
                    <span aria-hidden className="text-ink-muted">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canManage && <Card title="Add a client account" className="self-start">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="Client name" error={errors.name?.message} {...form.register("name")} />
            <FormError>{errors.root?.message}</FormError>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding…" : "Add client account"}</Button>
          </form>
        </Card>}
      </div>
    </>
  );
}
