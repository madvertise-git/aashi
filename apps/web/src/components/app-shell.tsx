"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { client, ApiError } from "@/lib/api";
import { useAccounts, useMe } from "@/lib/queries";

/**
 * The signed-in frame: brand, agency switcher, client account switcher, sign out.
 * Sends visitors who are not signed in to the sign-in page.
 */
export function AppShell({ agencyId, accountId, children }: { agencyId?: string; accountId?: string; children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const accounts = useAccounts(agencyId);
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/sign-in");
  }, [signedOut, router]);

  async function signOut() {
    await client.POST("/v1/auth/sign-out").catch(() => undefined);
    queryClient.clear();
    router.replace("/sign-in");
  }

  if (me.isPending || signedOut) return <p className="p-8 text-sm text-ink-muted">Loading…</p>;
  if (me.isError) {
    return (
      <div className="p-8 text-sm">
        <p role="alert" className="text-danger">{me.error.message}</p>
        <button className="mt-2 underline" onClick={() => me.refetch()}>Try again</button>
      </div>
    );
  }

  const select = "h-9 max-w-48 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="text-base font-semibold text-brand">Aashi</Link>
          {agencyId && (
            <nav aria-label="Workspace" className="flex flex-wrap items-center gap-2">
              <select aria-label="Agency" className={select} value={agencyId} onChange={(e) => router.push(`/agencies/${e.target.value}`)}>
                {me.data.agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <span aria-hidden className="text-ink-muted">/</span>
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
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-muted sm:inline">{me.data.user.name}</span>
            <Link href="/settings/security" className="text-ink-muted underline-offset-2 hover:underline">Security</Link>
            <button onClick={signOut} className="rounded-md border border-line px-3 py-1.5 hover:bg-canvas">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
