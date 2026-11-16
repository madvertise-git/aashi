"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronLeft, Contact, KanbanSquare, LayoutDashboard, LogOut, type LucideIcon, Menu, ShieldCheck, SlidersHorizontal, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ApiError, client } from "@/lib/api";
import { useAccounts, useMe } from "@/lib/queries";
import { Avatar, Skeleton } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlighted for this address and anything beneath it; `exact` limits it to the address itself. */
  exact?: boolean;
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-white ${
        active ? "bg-rail-active font-medium text-white" : "text-rail-ink hover:bg-rail-active/60"
      }`}
    >
      <item.icon aria-hidden className="size-[18px] shrink-0" />
      {item.label}
    </Link>
  );
}

/**
 * The signed-in frame: a navigation rail with the agency and client switchers,
 * the pages for whichever of the two you are in, and your own menu at the foot.
 * Sends visitors who are not signed in to the sign-in page.
 */
export function AppShell({ agencyId, accountId, children }: { agencyId?: string; accountId?: string; children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const accounts = useAccounts(agencyId);
  const [open, setOpen] = useState(false);
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/sign-in");
  }, [signedOut, router]);

  async function signOut() {
    await client.POST("/v1/auth/sign-out").catch(() => undefined);
    queryClient.clear();
    router.replace("/sign-in");
  }

  if (me.isPending || signedOut) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 bg-rail lg:block" />
        <div className="flex-1 p-8">
          <span className="sr-only">Loading…</span>
          <Skeleton className="mb-6 h-8 w-56" />
          <Skeleton className="h-40 w-full max-w-3xl" />
        </div>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="p-8 text-sm">
        <p role="alert" className="text-danger">{me.error.message}</p>
        <button className="mt-2 underline" onClick={() => me.refetch()}>Try again</button>
      </div>
    );
  }

  const home = agencyId ?? me.data.agencies[0]?.id;
  const account = accounts.data?.find((a) => a.id === accountId);
  const clientPages: NavItem[] = accountId
    ? [
        { href: `/accounts/${accountId}`, label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: `/accounts/${accountId}/contacts`, label: "Contacts", icon: Contact },
        { href: `/accounts/${accountId}/companies`, label: "Companies", icon: Building2 },
        { href: `/accounts/${accountId}/pipeline`, label: "Pipeline", icon: KanbanSquare },
        { href: `/accounts/${accountId}/fields`, label: "Custom fields", icon: SlidersHorizontal },
      ]
    : [];
  const agencyPages: NavItem[] = home
    ? [
        { href: `/agencies/${home}`, label: "Clients", icon: LayoutDashboard, exact: true },
        { href: `/agencies/${home}/team`, label: "Team", icon: Users },
      ]
    : [];
  const close = () => setOpen(false);
  const select = "h-9 w-full rounded-lg border border-white/10 bg-rail-active px-2 text-sm text-white";

  const rail = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-rail px-3 py-5 text-rail-ink">
      <div className="flex items-center justify-between px-2">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-base font-semibold text-white">
          <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-brand text-xs text-brand-contrast">A</span>
          Aashi
        </Link>
        <button className="rounded-lg p-1 text-rail-muted hover:text-white lg:hidden" onClick={close} aria-label="Close menu">
          <X aria-hidden className="size-5" />
        </button>
      </div>

      {agencyId && (
        <div className="flex flex-col gap-2 px-2">
          <select aria-label="Agency" className={select} value={agencyId} onChange={(e) => router.push(`/agencies/${e.target.value}`)}>
            {me.data.agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            aria-label="Client account"
            className={select}
            value={accountId ?? ""}
            onChange={(e) => router.push(e.target.value ? `/accounts/${e.target.value}` : `/agencies/${agencyId}`)}
          >
            <option value="">All client accounts</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {accountId && (
        <nav aria-label="Client" className="flex flex-col gap-1">
          <p className="truncate px-3 pb-1 text-xs font-medium uppercase tracking-wider text-rail-muted">{account?.name ?? "Client"}</p>
          {clientPages.map((item) => <NavLink key={item.href} item={item} onNavigate={close} />)}
        </nav>
      )}

      {agencyPages.length > 0 && (
        <nav aria-label="Agency" className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-rail-muted">Agency</p>
          {accountId && (
            <Link href={`/agencies/${home}`} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-rail-ink hover:bg-rail-active/60">
              <ChevronLeft aria-hidden className="size-[18px]" />
              All clients
            </Link>
          )}
          {!accountId && agencyPages.map((item) => <NavLink key={item.href} item={item} onNavigate={close} />)}
          {accountId && <NavLink item={agencyPages[1]!} onNavigate={close} />}
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4">
        <NavLink item={{ href: "/settings/security", label: "Security", icon: ShieldCheck }} onNavigate={close} />
        <div className="mt-2 flex items-center gap-3 px-3 py-2">
          <Avatar name={me.data.user.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{me.data.user.name}</span>
            <span className="block truncate text-xs text-rail-muted">{me.data.user.email}</span>
          </span>
          <button onClick={signOut} className="rounded-lg p-1.5 text-rail-muted hover:bg-rail-active hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut aria-hidden className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{rail}</aside>

      {/* On phones the rail is a drawer behind a menu button. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line p-1.5" aria-label="Open menu" aria-expanded={open}>
          <Menu aria-hidden className="size-5" />
        </button>
        <span className="truncate text-sm font-semibold">{account?.name ?? "Aashi"}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" onClick={close} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-lift">{rail}</div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
