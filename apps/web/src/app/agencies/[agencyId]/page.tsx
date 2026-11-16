"use client";

import { createAccountInput, type CreateAccountInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building, Contact, HandCoins, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Avatar, Button, Card, Empty, Field, FormError, PageHeader, QuietButton, Skeleton, Stat } from "@/components/ui";
import { client, isNotFound } from "@/lib/api";
import { count, greeting, moneyShort } from "@/lib/format";
import { keys, useAgencySummary, useMe } from "@/lib/queries";

export default function AgencyPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  return (
    <AppShell agencyId={agencyId}>
      <Clients agencyId={agencyId} />
    </AppShell>
  );
}

function Clients({ agencyId }: { agencyId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const summary = useAgencySummary(agencyId);
  const agency = me.data?.agencies.find((a) => a.id === agencyId);
  const canManage = agency?.role === "owner" || agency?.role === "admin";
  const [adding, setAdding] = useState(false);
  const form = useForm<CreateAccountInput>({ resolver: zodResolver(createAccountInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/agencies/{agencyId}/accounts", { params: { path: { agencyId } }, body: values });
      form.reset();
      setAdding(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.accounts(agencyId) }),
        queryClient.invalidateQueries({ queryKey: keys.agencySummary(agencyId) }),
      ]);
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

  if (summary.isError) {
    return <FormError>{isNotFound(summary.error) ? "This agency does not exist, or you do not have access to it." : summary.error.message}</FormError>;
  }

  const accounts = summary.data?.accounts ?? [];
  const total = (field: "contacts" | "openDeals" | "openValueMinor") => accounts.reduce((n, a) => n + a[field], 0);
  const empty = summary.data && accounts.length === 0;
  const showForm = canManage && (adding || empty);

  return (
    <>
      <PageHeader
        eyebrow={me.data ? `${greeting()}, ${me.data.user.name.split(" ")[0]}` : undefined}
        title={agency?.name ?? "Agency"}
        description="Every client account, and how each one is doing."
        action={
          canManage && !empty && (
            <Button onClick={() => setAdding(!adding)}>
              <Plus aria-hidden className="size-4" />
              New client
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summary.data ? (
          <>
            <Stat icon={Building} label="Client accounts" value={count(accounts.length)} />
            <Stat icon={Contact} label="Contacts" value={count(total("contacts"))} note="Across all clients" />
            <Stat icon={HandCoins} label="Open pipeline" value={moneyShort(total("openValueMinor"))} note={`${count(total("openDeals"))} open deals`} tone="accent" />
            <Stat icon={Users} label="Team members" value={count(summary.data.members)} tone="success" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {showForm && (
        <Card title="Add a client account" className="mb-6 max-w-md">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="Client name" placeholder="e.g. Sunrise Dental" error={errors.name?.message} {...form.register("name")} />
            <FormError>{errors.root?.message}</FormError>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding…" : "Add client account"}</Button>
              {!empty && <QuietButton className="h-10" onClick={() => setAdding(false)}>Cancel</QuietButton>}
            </div>
          </form>
        </Card>
      )}

      {!summary.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : empty ? (
        <Empty icon={Building} title="No client accounts yet">
          {canManage ? "Add your first client above. Each one keeps its contacts and deals separate." : "An admin of this agency has not added any clients yet."}
        </Empty>
      ) : (
        <ul aria-label="Client accounts" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/accounts/${account.id}`}
                className="group block rounded-xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={account.name} />
                  <span className="min-w-0 flex-1 truncate font-medium">{account.name}</span>
                  <ArrowRight aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
                <dl className="tabular mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted">Contacts</dt>
                    <dd className="font-semibold">{count(account.contacts)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Open deals</dt>
                    <dd className="font-semibold">{count(account.openDeals)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Pipeline</dt>
                    <dd className="font-semibold">{moneyShort(account.openValueMinor)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
