import type { ReactNode } from "react";

export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold text-brand">Aashi</p>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="mb-5 text-xl font-semibold">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-ink-muted">{footer}</p>
      </div>
    </main>
  );
}
