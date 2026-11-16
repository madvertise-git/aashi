import { CalendarCheck, KanbanSquare, MessagesSquare, Megaphone } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  { icon: KanbanSquare, title: "Every lead in one pipeline", text: "Contacts, companies and deals for each client, kept apart by design." },
  { icon: MessagesSquare, title: "One inbox for every channel", text: "Email, SMS and WhatsApp conversations next to the contact they belong to." },
  { icon: Megaphone, title: "From creative to campaign", text: "Make the ad, launch it, and see which leads it brought in." },
  { icon: CalendarCheck, title: "Built for Indian agencies", text: "Indian phone formats, rupees, and your data kept in India." },
];

/** The frame around sign-in, sign-up and invite screens: the form on one side, what the product does on the other. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-sm">
          <p className="mb-10 flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm text-brand-contrast">A</span>
            Aashi
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          <p className="mt-6 text-sm text-ink-muted">{footer}</p>
        </div>
      </main>
      <aside className="relative hidden overflow-hidden bg-rail px-12 py-14 text-rail-ink lg:flex lg:flex-col lg:justify-center">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-white">Run your agency and every client from one place.</p>
          <ul className="mt-10 flex flex-col gap-6">
            {POINTS.map(({ icon: Icon, title: heading, text }) => (
              <li key={heading} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-rail-active text-white">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{heading}</span>
                  <span className="mt-0.5 block text-sm text-rail-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
