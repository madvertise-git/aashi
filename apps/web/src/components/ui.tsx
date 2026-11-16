import type { LucideIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { initials } from "@/lib/format";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast shadow-card transition-colors hover:bg-brand-strong disabled:opacity-60 ${focus} ${className}`}
      {...props}
    />
  );
}

/** A quieter button for secondary and destructive actions. */
export function QuietButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-canvas disabled:opacity-60 ${focus} ${className}`}
      {...props}
    />
  );
}

const control = "h-10 rounded-lg border bg-surface px-3 text-sm outline-none transition-shadow focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function Field({ label, error, hint, ...props }: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className={`${control} ${error ? "border-danger" : "border-line"}`}
        {...props}
      />
      {note && (
        <p id={`${id}-note`} className={`text-xs ${error ? "text-danger" : "text-ink-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

/** A labelled drop-down, styled like Field. */
export function Select({ label, error, children, ...props }: ComponentProps<"select"> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={`${control} px-2 ${error ? "border-danger" : "border-line"}`} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 shadow-card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** What a list shows before it has anything in it: what belongs here and how to start. */
export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center">
      {Icon && (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      {title && <p className="text-sm font-medium">{title}</p>}
      <p className="max-w-sm text-sm text-ink-muted">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** The title row at the top of every screen. */
export function PageHeader({ title, eyebrow, description, action }: { title: string; eyebrow?: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-sm text-ink-muted">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** One headline number on a dashboard. */
export function Stat({ icon: Icon, label, value, note, tone = "brand" }: { icon: LucideIcon; label: string; value: string; note?: ReactNode; tone?: "brand" | "accent" | "success" }) {
  const tones = { brand: "bg-brand-soft text-brand", accent: "bg-accent/15 text-accent", success: "bg-success/10 text-success" };
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon aria-hidden className="size-[18px]" />
        </span>
        <p className="text-sm text-ink-muted">{label}</p>
      </div>
      <p className="tabular mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" | "danger" }) {
  const tones = {
    neutral: "bg-canvas text-ink-muted border-line",
    brand: "bg-brand-soft text-brand border-transparent",
    success: "bg-success/10 text-success border-transparent",
    danger: "bg-danger/10 text-danger border-transparent",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** A person or client shown as their initials. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" };
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ${sizes[size]}`}>
      {initials(name)}
    </span>
  );
}

/** A grey block standing in for content that is still loading. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}
