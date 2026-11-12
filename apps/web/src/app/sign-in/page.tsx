"use client";

import { signInInput, type SignInInput, type User } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, FormError } from "@/components/ui";
import { api } from "@/lib/api";

export default function SignIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<SignInInput>({ resolver: zodResolver(signInInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await api<User>("/v1/auth/sign-in", { method: "POST", body: values });
      queryClient.clear();
      router.push("/");
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
    }
  });

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
