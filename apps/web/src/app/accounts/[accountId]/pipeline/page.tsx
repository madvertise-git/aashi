"use client";

import type { Deal, Pipeline, Stage } from "@aashi/contracts";
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, KanbanSquare, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Empty, Field, FormError, PageHeader, QuietButton, Select, Skeleton } from "@/components/ui";
import { client } from "@/lib/api";
import { count, money, moneyShort } from "@/lib/format";
import { keys, useAccount, useContacts, useDeals, useMe, usePipelines } from "@/lib/queries";

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

export default function PipelinePage() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccount(accountId);
  const me = useMe();
  const pipelines = usePipelines(accountId);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const role = me.data?.agencies.find((a) => a.id === account.data?.agencyId)?.role;
  const canManage = role === "owner" || role === "admin";
  const pipeline = pipelines.data?.[0];

  async function create() {
    setError(null);
    try {
      await client.POST("/v1/accounts/{accountId}/pipelines", { params: { path: { accountId } }, body: { name: "Sales" } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.pipelines(accountId) }),
        queryClient.invalidateQueries({ queryKey: keys.accountSummary(accountId) }),
      ]);
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <AppShell agencyId={account.data?.agencyId} accountId={accountId}>
      <PageHeader title="Pipeline" description="Drag a deal to its next stage, or use the menu on the card." />
      {pipelines.isError ? (
        <FormError>{pipelines.error.message}</FormError>
      ) : !pipelines.data ? (
        <Skeleton className="h-72" />
      ) : !pipeline ? (
        <Empty
          icon={KanbanSquare}
          title="No pipeline yet"
          action={canManage && <Button onClick={create}><Plus aria-hidden className="size-4" />Create sales pipeline</Button>}
        >
          {canManage
            ? "Start with the standard stages: New lead, Contacted, Qualified, Proposal sent, Won and Lost."
            : "An admin of this agency needs to create the pipeline first."}
          {error && <span className="mt-2 block text-danger">{error}</span>}
        </Empty>
      ) : (
        <Board accountId={accountId} pipeline={pipeline} />
      )}
    </AppShell>
  );
}

function Board({ accountId, pipeline }: { accountId: string; pipeline: Pipeline }) {
  const queryClient = useQueryClient();
  const deals = useDeals(accountId, pipeline.id);
  const [error, setError] = useState<string | null>(null);
  // A small movement threshold, so a click on the card's controls is not mistaken for a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const key = keys.deals(accountId, pipeline.id);
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: keys.accountSummary(accountId) })]);

  /** Moves a deal to the bottom of a stage: on screen at once, then on the server. */
  async function move(deal: Deal, stageId: string) {
    if (deal.stageId === stageId) return;
    setError(null);
    const position = Date.now();
    queryClient.setQueryData<Deal[]>(key, (all) => all?.map((d) => (d.id === deal.id ? { ...d, stageId, position } : d)));
    try {
      await client.PATCH("/v1/accounts/{accountId}/deals/{dealId}", { params: { path: { accountId, dealId: deal.id } }, body: { stageId, position } });
    } catch (e) {
      setError(message(e));
    }
    await refresh();
  }

  async function remove(deal: Deal) {
    if (!window.confirm(`Delete the deal "${deal.title}"? This cannot be undone.`)) return;
    await client.DELETE("/v1/accounts/{accountId}/deals/{dealId}", { params: { path: { accountId, dealId: deal.id } } }).catch((e) => setError(message(e)));
    await refresh();
  }

  function onDragEnd(event: DragEndEvent) {
    const deal = deals.data?.find((d) => d.id === event.active.id);
    if (deal && event.over) void move(deal, String(event.over.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <NewDeal accountId={accountId} pipeline={pipeline} onAdded={refresh} />
      <FormError>{error ?? (deals.isError ? deals.error.message : null)}</FormError>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-4">
            {pipeline.stages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                stages={pipeline.stages}
                deals={(deals.data ?? []).filter((d) => d.stageId === stage.id).sort((x, y) => x.position - y.position)}
                loading={deals.isPending}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function Column({ stage, stages, deals, loading, onMove, onRemove }: {
  stage: Stage;
  stages: Stage[];
  deals: Deal[];
  loading: boolean;
  onMove: (deal: Deal, stageId: string) => void;
  onRemove: (deal: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const dot = { open: "bg-brand", won: "bg-success", lost: "bg-ink-muted/60" };
  const total = deals.reduce((n, d) => n + d.valueMinor, 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={`flex w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${isOver ? "border-brand bg-brand-soft" : "border-line bg-canvas"}`}
    >
      <header className="mb-3 flex items-center gap-2 px-1">
        <span aria-hidden className={`size-2 rounded-full ${dot[stage.kind]}`} />
        <h2 className="text-sm font-semibold">{stage.name}</h2>
        <span className="tabular ml-auto text-xs text-ink-muted">{count(deals.length)} · {moneyShort(total)}</span>
      </header>
      <ul className="flex min-h-24 flex-col gap-2">
        {loading && <Skeleton className="h-20" />}
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stages={stages} onMove={onMove} onRemove={onRemove} />
        ))}
        {!loading && deals.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">Drop a deal here</li>}
      </ul>
    </section>
  );
}

function DealCard({ deal, stages, onMove, onRemove }: { deal: Deal; stages: Stage[]; onMove: (deal: Deal, stageId: string) => void; onRemove: (deal: Deal) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`rounded-lg border border-line bg-surface p-3 text-sm shadow-card ${isDragging ? "relative z-10 shadow-lift" : ""}`}
    >
      <div className="flex items-start gap-1">
        <button {...listeners} {...attributes} className="-ml-1 mt-0.5 cursor-grab touch-none rounded p-0.5 text-ink-muted hover:text-ink" aria-label={`Drag ${deal.title}`}>
          <GripVertical aria-hidden className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{deal.title}</p>
          {deal.contactName && <p className="truncate text-xs text-ink-muted">{deal.contactName}</p>}
          <p className="tabular mt-1 font-semibold">{money(deal.valueMinor)}</p>
        </div>
        <button className="rounded p-1 text-ink-muted hover:text-danger" onClick={() => onRemove(deal)} aria-label={`Delete ${deal.title}`}>
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
      {/* The same move without dragging: for keyboards, screen readers and small phones. */}
      <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <span>Stage</span>
        <select
          aria-label={`Stage for ${deal.title}`}
          className="h-7 flex-1 rounded-md border border-line bg-surface px-1 text-xs text-ink"
          value={deal.stageId}
          onChange={(e) => onMove(deal, e.target.value)}
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    </li>
  );
}

function NewDeal({ accountId, pipeline, onAdded }: { accountId: string; pipeline: Pipeline; onAdded: () => Promise<unknown> }) {
  const contacts = useContacts(accountId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rupees, setRupees] = useState("");
  const [contactId, setContactId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = rupees.trim() === "" ? 0 : Number(rupees);
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = "Deal name is required";
    if (!Number.isFinite(amount) || amount < 0) found.value = "Enter an amount in rupees";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await client.POST("/v1/accounts/{accountId}/deals", {
        params: { path: { accountId } },
        // Rupees on screen, whole paise on the wire.
        body: { pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title, valueMinor: Math.round(amount * 100), contactId: contactId || null },
      });
      setTitle("");
      setRupees("");
      setContactId("");
      setOpen(false);
      await onAdded();
    } catch (e) {
      setErrors({ root: message(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}><Plus aria-hidden className="size-4" />New deal</Button>
      </div>
    );
  }
  return (
    <Card title="New deal" className="max-w-2xl">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field label="Deal name" placeholder="e.g. Braces for Rahul" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <Field label="Value (₹)" inputMode="decimal" placeholder="50000" value={rupees} onChange={(e) => setRupees(e.target.value)} error={errors.value} />
        <Select label="Contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">No contact</option>
          {contacts.data?.items.map((c) => <option key={c.id} value={c.id}>{[c.firstName, c.lastName].filter(Boolean).join(" ")}</option>)}
        </Select>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add deal"}</Button>
          <QuietButton className="h-10" onClick={() => setOpen(false)}>Cancel</QuietButton>
        </div>
        {errors.root && <div className="sm:col-span-3"><FormError>{errors.root}</FormError></div>}
      </form>
    </Card>
  );
}
