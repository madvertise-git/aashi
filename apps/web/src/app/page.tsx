"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/lib/queries";

/** Sends a signed-in user to their agency, or to onboarding if they have none yet. */
export default function Home() {
  const router = useRouter();
  const me = useMe();
  const first = me.data?.agencies[0];

  useEffect(() => {
    if (!me.data) return;
    router.replace(first ? `/agencies/${first.id}` : "/onboarding");
  }, [me.data, first, router]);

  return (
    <AppShell>
      <p className="text-sm text-ink-muted">Loading…</p>
    </AppShell>
  );
}
