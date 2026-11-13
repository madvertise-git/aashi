"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Button, FormError } from "@/components/ui";
import { client, ApiError } from "@/lib/api";
import { useMe } from "@/lib/queries";

/** Where an invite link lands. The person signs in (or creates an account) with the invited email, then joins. */
function Accept() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useSearchParams().get("token") ?? "";
  const me = useMe();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const back = `/invites/accept?token=${encodeURIComponent(token)}`;

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const agency = (await client.POST("/v1/invites/accept", { body: { token } })).data!;
      queryClient.clear();
      router.push(`/agencies/${agency.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (signedOut) {
    return (
      <AuthLayout title="You have been invited" footer={<>Use the email address the invite was sent to.</>}>
        <div className="flex flex-col gap-3 text-sm">
          <p>Sign in or create an account to join the team.</p>
          <Link className="text-brand underline" href={`/sign-in?next=${encodeURIComponent(back)}`}>Sign in</Link>
          <Link className="text-brand underline" href={`/sign-up?next=${encodeURIComponent(back)}`}>Create an account</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Join the team" footer={me.data ? <>Signed in as {me.data.user.email}</> : null}>
      <div className="flex flex-col gap-4">
        <FormError>{error}</FormError>
        <Button onClick={join} disabled={busy || !me.data || !token}>{busy ? "Joining…" : "Accept invite"}</Button>
      </div>
    </AuthLayout>
  );
}

export default function AcceptInvite() {
  return (
    <Suspense>
      <Accept />
    </Suspense>
  );
}
