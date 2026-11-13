"use client";

import { createInviteInput, type CreateInviteInput, type Invite } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError } from "@/components/ui";
import { client, ApiError } from "@/lib/api";
import { keys, useInvites, useMe, useMembers } from "@/lib/queries";

const ROLE_NAMES = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export default function TeamPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  return (
    <AppShell agencyId={agencyId}>
      <Team agencyId={agencyId} />
    </AppShell>
  );
}

function Team({ agencyId }: { agencyId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const role = me.data?.agencies.find((a) => a.id === agencyId)?.role;
  const canManage = role === "owner" || role === "admin";
  const members = useMembers(agencyId);
  const invites = useInvites(agencyId, canManage);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<CreateInviteInput>({ resolver: zodResolver(createInviteInput), defaultValues: { role: "member" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setSentTo(null);
    try {
      const invite = (await client.POST("/v1/agencies/{agencyId}/invites", { params: { path: { agencyId } }, body: values })).data!;
      form.reset();
      setSentTo(invite.email);
      await queryClient.invalidateQueries({ queryKey: keys.invites(agencyId) });
    } catch (error) {
      if (error instanceof ApiError && error.code === "already_member") form.setError("email", { message: error.message });
      else form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

  async function revoke(invite: Invite) {
    await client
      .DELETE("/v1/agencies/{agencyId}/invites/{inviteId}", { params: { path: { agencyId, inviteId: invite.id } } })
      .catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: keys.invites(agencyId) });
  }

  if (members.isError) return <FormError>{members.error.message}</FormError>;

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Team</h1>
      <p className="mb-6 text-sm text-ink-muted">
        People in this agency can work in all of its client accounts.{" "}
        <Link className="text-brand underline" href={`/agencies/${agencyId}`}>Back to client accounts</Link>
      </p>
      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-6">
          <Card title="Members">
            {members.isPending ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : (
              <ul aria-label="Members" className="divide-y divide-line">
                {members.data.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span><span className="font-medium">{m.name}</span> <span className="text-ink-muted">{m.email}</span></span>
                    <span className="text-ink-muted">{ROLE_NAMES[m.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canManage && (
            <Card title="Invites waiting to be accepted">
              {!invites.data || invites.data.length === 0 ? (
                <Empty>No open invites.</Empty>
              ) : (
                <ul aria-label="Open invites" className="divide-y divide-line">
                  {invites.data.map((invite) => (
                    <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span>{invite.email} <span className="text-ink-muted">· {ROLE_NAMES[invite.role]}</span></span>
                      <button className="rounded-md border border-line px-3 py-1.5 hover:bg-canvas" onClick={() => revoke(invite)}>
                        Cancel<span className="sr-only"> invite for {invite.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
        {canManage && (
          <Card title="Invite someone" className="self-start">
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Field label="Their email" type="email" error={errors.email?.message} {...form.register("email")} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="invite-role" className="text-sm font-medium">Role</label>
                <select id="invite-role" className="h-10 rounded-md border border-line bg-surface px-2 text-sm" {...form.register("role")}>
                  <option value="member">Member: works with client data</option>
                  <option value="admin">Admin: also manages team and client accounts</option>
                </select>
              </div>
              <FormError>{errors.root?.message}</FormError>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send invite"}</Button>
              {sentTo && <p role="status" className="text-sm text-ink-muted">Invite sent to {sentTo}. The link works for 7 days.</p>}
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
