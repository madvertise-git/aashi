"use client";

import type { AccountSummary } from "@aashi/contracts";
import { ArrowRight, Building2, Check, Contact, HandCoins, KanbanSquare, Trophy, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Avatar, Badge, Card, Empty, FormError, PageHeader, Skeleton, Stat } from "@/components/ui";
import { isNotFound } from "@/lib/api";
import { ago, count, money, moneyShort } from "@/lib/format";
import { useAccount, useAccountSummary } from "@/lib/queries";

export default function AccountDashboard() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccount(accountId);
  const summary = useAccountSummary(accountId);
  const error = account.error ?? summary.error;

  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      {error ? (
        <FormError>{isNotFound(error) ? "This client account does not exist, or you do not have access to it." : error.message}</FormError>
      ) : (
        <>
          <PageHeader
            eyebrow="Dashboard"
            title={account.data?.name ?? " "}
            action={
              <Link
                href={`/accounts/${accountId}/contacts`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast shadow-card hover:bg-brand-strong"
              >
                <UserPlus aria-hidden className="size-4" />
                Add a contact
              </Link>
            }
          />
          {summary.data ? <Dashboard accountId={accountId} summary={summary.data} /> : <Loading />}
        </>
      )}
    </AppShell>
  );
}

function Loading() {
  return (
    <>
      <span className="sr-only">Loading…</span>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </>
  );
}

function Dashboard({ accountId, summary }: { accountId: string; summary: AccountSummary }) {
  const base = `/accounts/${accountId}`;
  const { contacts, deals } = summary;
  const change = contacts.last7Days - contacts.previous7Days;
  const hasPipeline = summary.stages.length > 0;
  const steps = [
    { done: contacts.total > 0, label: "Add your first contact", href: `${base}/contacts` },
    { done: hasPipeline, label: "Set up a sales pipeline", href: `${base}/pipeline` },
    { done: deals.open.count + deals.won.count + deals.lost.count > 0, label: "Add a deal to the pipeline", href: `${base}/pipeline` },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="flex flex-col gap-6">
      {remaining > 0 && (
        <Card title="Get this client set up" action={<Badge tone="brand">{steps.length - remaining} of {steps.length} done</Badge>}>
          <ol className="flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.label}>
                <Link href={step.href} className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-canvas">
                  <span className={`flex size-6 items-center justify-center rounded-full border ${step.done ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}>
                    {step.done && <Check aria-hidden className="size-3.5" />}
                  </span>
                  <span className={step.done ? "text-ink-muted line-through" : "font-medium"}>{step.label}</span>
                  {step.done && <span className="sr-only">(done)</span>}
                  {!step.done && <ArrowRight aria-hidden className="ml-auto size-4 text-ink-muted group-hover:text-brand" />}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          icon={Contact}
          label="Contacts"
          value={count(contacts.total)}
          note={
            contacts.last7Days === 0
              ? "None added this week"
              : `${count(contacts.last7Days)} this week${change === 0 ? "" : ` · ${change > 0 ? "up" : "down"} ${count(Math.abs(change))} on last week`}`
          }
        />
        <Stat icon={HandCoins} label="Open pipeline" value={moneyShort(deals.open.valueMinor)} note={`${count(deals.open.count)} open deal${deals.open.count === 1 ? "" : "s"}`} tone="accent" />
        <Stat icon={Trophy} label="Won" value={moneyShort(deals.won.valueMinor)} note={`${count(deals.won.count)} won · ${count(deals.lost.count)} lost`} tone="success" />
        <Stat icon={Building2} label="Companies" value={count(summary.companies)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="New contacts, last 14 days">
          <ContactsChart days={summary.contactsByDay} />
        </Card>
        <Card title="Pipeline" action={<Link className="text-sm text-brand hover:underline" href={`${base}/pipeline`}>Open board</Link>}>
          {hasPipeline ? (
            <Funnel stages={summary.stages} />
          ) : (
            <Empty icon={KanbanSquare} title="No pipeline yet">Track each deal from new lead to won on a board.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Latest contacts" action={<Link className="text-sm text-brand hover:underline" href={`${base}/contacts`}>View all</Link>}>
          {summary.recentContacts.length === 0 ? (
            <Empty icon={Contact}>New contacts show up here as they are added.</Empty>
          ) : (
            <ul aria-label="Latest contacts" className="divide-y divide-line">
              {summary.recentContacts.map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/contacts/${c.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand">
                    <Avatar name={c.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="text-xs text-ink-muted">{ago(c.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest deals">
          {summary.recentDeals.length === 0 ? (
            <Empty icon={HandCoins}>Deals show up here as they move through the pipeline.</Empty>
          ) : (
            <ul aria-label="Latest deals" className="divide-y divide-line">
              {summary.recentDeals.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="text-xs text-ink-muted">{d.stageName} · {ago(d.updatedAt)}</span>
                  </span>
                  <span className="tabular font-medium">{money(d.valueMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** One bar per day. The same numbers are in a table for screen readers. */
function ContactsChart({ days }: { days: AccountSummary["contactsByDay"] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (days.every((d) => d.count === 0)) {
    return <Empty icon={Contact}>No contacts were added in the last two weeks.</Empty>;
  }
  return (
    <>
      <div aria-hidden className="flex h-44 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${label(d.date)}: ${d.count}`}>
            <span className="tabular mb-1 text-center text-[11px] text-ink-muted opacity-0 group-hover:opacity-100">{d.count}</span>
            <div className={`rounded-t-md ${d.count === 0 ? "bg-line" : "bg-brand group-hover:bg-brand-strong"}`} style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex justify-between text-xs text-ink-muted">
        <span>{label(days[0]!.date)}</span>
        <span>{label(days.at(-1)!.date)}</span>
      </div>
      <table className="sr-only">
        <caption>New contacts per day</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{label(d.date)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Each stage as a bar, as wide as its share of the busiest stage. */
function Funnel({ stages }: { stages: AccountSummary["stages"] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const colour = { open: "bg-brand", won: "bg-success", lost: "bg-ink-muted/50" };
  return (
    <ul aria-label="Deals by stage" className="flex flex-col gap-3">
      {stages.map((s) => (
        <li key={s.id} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            <span>{s.name}</span>
            <span className="tabular text-ink-muted">{count(s.count)} · {moneyShort(s.valueMinor)}</span>
          </div>
          <div className="h-2 rounded-full bg-canvas">
            <div className={`h-2 rounded-full ${colour[s.kind]}`} style={{ width: `${(s.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
