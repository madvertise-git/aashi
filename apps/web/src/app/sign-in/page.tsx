"use client";

import { codeInput, type CodeInput, signInInput, type SignInInput, type SignInResult, type User } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, FormError } from "@/components/ui";
import { api, nextPath } from "@/lib/api";

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

export default function SignIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [needsCode, setNeedsCode] = useState(false);
  const form = useForm<SignInInput>({ resolver: zodResolver(signInInput) });
  const codeForm = useForm<CodeInput>({ resolver: zodResolver(codeInput) });

  function done() {
    queryClient.clear();
    router.push(nextPath("/"));
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api<SignInResult>("/v1/auth/sign-in", { method: "POST", body: values });
      if (result.twoFactorRequired) setNeedsCode(true);
      else done();
    } catch (error) {
      form.setError("root", { message: message(error) });
    }
  });

  const submitCode = codeForm.handleSubmit(async (values) => {
    try {
      await api<User>("/v1/auth/two-factor/verify", { method: "POST", body: values });
      done();
    } catch (error) {
      codeForm.setError("root", { message: message(error) });
    }
  });

  if (needsCode) {
    const { errors, isSubmitting } = codeForm.formState;
    return (
      <AuthLayout title="Enter your code" footer={<button className="text-brand underline" onClick={() => setNeedsCode(false)}>Back to sign in</button>}>
        <form onSubmit={submitCode} noValidate className="flex flex-col gap-4">
          <Field
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            hint="The 6-digit code from your authenticator app, or one of your backup codes."
            error={errors.code?.message}
            {...codeForm.register("code")}
          />
          <FormError>{errors.root?.message}</FormError>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Checking…" : "Continue"}</Button>
        </form>
      </AuthLayout>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthLayout title="Sign in" footer={<>New here? <Link className="text-brand underline" href="/sign-up">Create an account</Link></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register("email")} />
        <Field label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register("password")} />
        <FormError>{errors.root?.message}</FormError>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
      </form>
    </AuthLayout>
  );
}
