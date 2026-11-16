"use client";

import { createAccountInput, type CreateAccountInput, createAgencyInput, type CreateAgencyInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Field, FormError } from "@/components/ui";
import { ApiError, client } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";

const STEPS = ["Your agency", "First client"];
const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** First run after signing up: name the agency, then add the first client and land on its dashboard. */
export default function Onboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const step = agencyId ? 1 : 0;
  const agencyForm = useForm<CreateAgencyInput>({ resolver: zodResolver(createAgencyInput) });
  const clientForm = useForm<CreateAccountInput>({ resolver: zodResolver(createAccountInput) });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/sign-in");
  }, [me.error, router]);

  const createAgency = agencyForm.handleSubmit(async (values) => {
    try {
      const agency = (await client.POST("/v1/agencies", { body: values })).data!;
      await queryClient.invalidateQueries({ queryKey: keys.me });
      setAgencyId(agency.id);
    } catch (error) {
      agencyForm.setError("root", { message: message(error) });
    }
  });

  const createClient = clientForm.handleSubmit(async (values) => {
    if (!agencyId) return;
    try {
      const account = (await client.POST("/v1/agencies/{agencyId}/accounts", { params: { path: { agencyId } }, body: values })).data!;
      await queryClient.invalidateQueries({ queryKey: keys.accounts(agencyId) });
      router.push(`/accounts/${account.id}`);
    } catch (error) {
      clientForm.setError("root", { message: message(error) });
    }
  });

  const firstName = me.data?.user.name.split(" ")[0];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <p className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm text-brand-contrast">A</span>
          Aashi
        </p>

        <ol aria-label="Progress" className="mb-6 flex items-center justify-center gap-3 text-sm">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step ? "bg-brand text-brand-contrast" : i === step ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-line text-ink-muted"
                }`}
              >
                {i < step ? <Check aria-hidden className="size-3.5" /> : i + 1}
              </span>
              <span className={i === step ? "font-medium" : "text-ink-muted"}>{label}</span>
              {i < STEPS.length - 1 && <span aria-hidden className="ml-1 h-px w-8 bg-line" />}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-line bg-surface p-7 shadow-card">
          {step === 0 ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Set up your agency</h1>
              <p className="mb-6 mt-1.5 text-sm text-ink-muted">
                {firstName ? `Welcome, ${firstName}. ` : ""}Your agency holds your team and all of your client accounts.
              </p>
              <form onSubmit={createAgency} noValidate className="flex flex-col gap-4">
                <Field label="Agency name" autoComplete="organization" autoFocus error={agencyForm.formState.errors.name?.message} {...agencyForm.register("name")} />
                <FormError>{agencyForm.formState.errors.root?.message}</FormError>
                <Button type="submit" disabled={agencyForm.formState.isSubmitting}>
                  {agencyForm.formState.isSubmitting ? "Creating…" : "Create agency"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Add your first client</h1>
              <p className="mb-6 mt-1.5 text-sm text-ink-muted">
                Each client gets its own account, so their contacts, deals and conversations never mix with another client’s.
              </p>
              <form onSubmit={createClient} noValidate className="flex flex-col gap-4">
                <Field label="Client name" placeholder="e.g. Sunrise Dental" autoFocus error={clientForm.formState.errors.name?.message} {...clientForm.register("name")} />
                <FormError>{clientForm.formState.errors.root?.message}</FormError>
                <Button type="submit" disabled={clientForm.formState.isSubmitting}>
                  {clientForm.formState.isSubmitting ? "Adding…" : "Add client account"}
                </Button>
                <button type="button" className="text-sm text-ink-muted underline-offset-2 hover:underline" onClick={() => router.push(`/agencies/${agencyId}`)}>
                  Skip for now
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
