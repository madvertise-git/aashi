"use client";

import { codeInput, type CodeInput, passwordInput, type PasswordInput, type TwoFactorSetup } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, FormError } from "@/components/ui";
import { client } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** Switch two-factor sign-in on or off for the signed-in user. */
function TwoFactor() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const passwordForm = useForm<PasswordInput>({ resolver: zodResolver(passwordInput) });
  const codeForm = useForm<CodeInput>({ resolver: zodResolver(codeInput) });
  const enabled = me.data?.user.twoFactorEnabled === true;

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    try {
      if (enabled) {
        await client.POST("/v1/auth/two-factor/disable", { body: values });
        await queryClient.invalidateQueries({ queryKey: keys.me });
      } else {
        setSetup((await client.POST("/v1/auth/two-factor/enable", { body: values })).data!);
      }
      passwordForm.reset();
    } catch (error) {
      passwordForm.setError("password", { message: message(error) });
    }
  });

  const submitCode = codeForm.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/auth/two-factor/confirm", { body: values });
      setSetup(null);
      codeForm.reset();
      await queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (error) {
      codeForm.setError("code", { message: message(error) });
    }
  });

  if (setup) {
    const key = new URL(setup.totpUri).searchParams.get("secret") ?? "";
    return (
      <Card title="Finish setting up two-factor sign-in">
        <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm">
          <li>
            Add this key to your authenticator app (Google Authenticator, Authy, 1Password):
            <code className="mt-1 block break-all rounded-md bg-canvas px-3 py-2">{key}</code>
            <a className="text-brand underline" href={setup.totpUri}>Or open it in an app on this device</a>
          </li>
          <li>
            Save these backup codes somewhere safe. Each works once if you lose your phone. They are not shown again.
            <ul aria-label="Backup codes" className="mt-1 grid grid-cols-2 gap-1 rounded-md bg-canvas px-3 py-2 font-mono">
              {setup.backupCodes.map((code) => <li key={code}>{code}</li>)}
            </ul>
          </li>
          <li>
            <form onSubmit={submitCode} noValidate className="flex flex-col gap-3">
              <Field label="Code from the app" inputMode="numeric" autoComplete="one-time-code" error={codeForm.formState.errors.code?.message} {...codeForm.register("code")} />
              <Button type="submit" disabled={codeForm.formState.isSubmitting}>Switch on two-factor sign-in</Button>
            </form>
          </li>
        </ol>
      </Card>
    );
  }

  return (
    <Card title="Two-factor sign-in">
      <p className="mb-4 text-sm text-ink-muted">
        {enabled
          ? "On. Signing in needs your password and a code from your authenticator app."
          : "Off. Switch it on to ask for a code from an authenticator app as well as your password."}
      </p>
      <form onSubmit={submitPassword} noValidate className="flex max-w-sm flex-col gap-3">
        <Field label="Your password" type="password" autoComplete="current-password" error={passwordForm.formState.errors.password?.message} {...passwordForm.register("password")} />
        <FormError>{passwordForm.formState.errors.root?.message}</FormError>
        <Button type="submit" disabled={passwordForm.formState.isSubmitting}>{enabled ? "Switch off" : "Set up"}</Button>
      </form>
    </Card>
  );
}

export default function Security() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold">Security</h1>
      <TwoFactor />
    </AppShell>
  );
}
