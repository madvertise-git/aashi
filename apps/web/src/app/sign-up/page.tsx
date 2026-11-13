"use client";

import { signUpInput, type SignUpInput } from "@aashi/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, FormError } from "@/components/ui";
import { client, ApiError, nextPath } from "@/lib/api";

export default function SignUp() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<SignUpInput>({ resolver: zodResolver(signUpInput) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await client.POST("/v1/auth/sign-up", { body: values });
      queryClient.clear();
      router.push(nextPath("/onboarding"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_taken") {
        form.setError("email", { message: "An account with this email already exists. Sign in instead." });
      } else {
        form.setError("root", { message: error instanceof Error ? error.message : "Something went wrong." });
      }
    }
  });

  return (
    <AuthLayout title="Create your account" footer={<>Already have an account? <Link className="text-brand underline" href="/sign-in">Sign in</Link></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Your name" autoComplete="name" error={errors.name?.message} {...form.register("name")} />
        <Field label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...form.register("email")} />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." error={errors.password?.message} {...form.register("password")} />
        <FormError>{errors.root?.message}</FormError>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account…" : "Create account"}</Button>
      </form>
    </AuthLayout>
  );
}
