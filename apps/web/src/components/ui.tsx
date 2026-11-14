import { type ComponentProps, type ReactNode, useId } from "react";

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-contrast hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

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
        className={`h-10 rounded-md border bg-surface px-3 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 ${error ? "border-danger" : "border-line"}`}
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

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">{children}</p>;
}

/** A labelled drop-down, styled like Field. */
export function Select({ label, error, children, ...props }: ComponentProps<"select"> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={`h-10 rounded-md border bg-surface px-2 text-sm ${error ? "border-danger" : "border-line"}`} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** A quieter button for secondary and destructive actions. */
export function QuietButton({ className = "", ...props }: ComponentProps<"button">) {
  return <button type="button" className={`rounded-md border border-line px-3 py-1.5 text-sm hover:bg-canvas disabled:opacity-60 ${className}`} {...props} />;
}
