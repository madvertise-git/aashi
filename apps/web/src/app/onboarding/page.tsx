"use client";

import { createAgencyInput, type CreateAgencyInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, FormError } from "@/components/ui";
import { client } from "@/lib/api";
import { keys } from "@/lib/queries";

export default function Onboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<CreateAgencyInput>({ resolver: zodResolver(createAgencyInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      const agency = (await client.POST("/v1/agencies", { body: values })).data!;
      await queryClient.invalidateQueries({ queryKey: keys.me });
      router.push(`/agencies/${agency.id}`);
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-2xl font-semibold">Set up your agency</h1>
        <p className="mb-6 text-sm text-ink-muted">Your agency holds your team and all of your client accounts.</p>
        <Card>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="Agency name" autoComplete="organization" error={errors.name?.message} {...form.register("name")} />
            <FormError>{errors.root?.message}</FormError>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create agency"}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
