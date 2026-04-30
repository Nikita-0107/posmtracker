import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
import { useTlsForMyWd, type TlOption } from "@/hooks/use-tl-issuances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-issue-tl")({
  component: WeeklyAllocationPage,
  head: () => ({
    meta: [
      { title: "Weekly TL Allocation — POSM Tracker" },
      {
        name: "description",
        content:
          "WD weekly POSM allocation to Team Leaders with weekly closure based on physical stock.",
      },
    ],
  }),
});

// ───────────────────────── helpers ─────────────────────────

function isoMondayOf(d = new Date()): string {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtRange(start: string, end: string) {
  const fmt = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ───────────────────────── data hooks ─────────────────────────

type AllocationRow = {
  id: string;
  wd_code: string;
  wd_tl_id: string;
  week_start: string;
  week_end: string;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  closure_proof_image_path: string | null;
  closure_note: string | null;
};

type AllocationItemRow = {
  id: string;
  allocation_id: string;
  material_code: string;
  qty_allocated: number;
  qty_remaining: number | null;
  qty_used: number | null;
};

function useWeeklyAllocations() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [items, setItems] = useState<AllocationItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: heads, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_weekly_allocations" as any)
      .select(
        "id, wd_code, wd_tl_id, week_start, week_end, status, created_at, closed_at, closure_proof_image_path, closure_note",
      )
      .order("week_start", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      setRows([]);
      setItems([]);
      setLoading(false);
      return;
    }
    const headRows = (heads ?? []) as unknown as AllocationRow[];
    setRows(headRows);
    if (headRows.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ids = headRows.map((r) => r.id);
    const { data: lines } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_weekly_allocation_items" as any)
      .select("id, allocation_id, material_code, qty_allocated, qty_remaining, qty_used")
      .in("allocation_id", ids);
    setItems((lines ?? []) as unknown as AllocationItemRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, items, loading, refresh };
}

// ───────────────────────── page ─────────────────────────

function WeeklyAllocationPage() {
  const { user } = useAuth();
  const { tls, loading: tlsLoading } = useTlsForMyWd();
  const { rows, items, loading: allocLoading, refresh } = useWeeklyAllocations();
  const { refresh: refreshWdStock } = useWdStock();

  const tlMap = useMemo(() => new Map(tls.map((t) => [t.id, t])), [tls]);

  // Group by TL
  const byTl = useMemo(() => {
    const m = new Map<
      string,
      { tl: TlOption | undefined; open: AllocationRow | null; history: AllocationRow[] }
    >();
    for (const t of tls) m.set(t.id, { tl: t, open: null, history: [] });
    for (const r of rows) {
      const existing = m.get(r.wd_tl_id) ?? {
        tl: tlMap.get(r.wd_tl_id),
        open: null,
        history: [],
      };
      if (r.status === "open") existing.open = r;
      else existing.history.push(r);
      m.set(r.wd_tl_id, existing);
    }
    return Array.from(m.values()).sort((a, b) =>
      (a.tl?.tl_name ?? "").localeCompare(b.tl?.tl_name ?? ""),
    );
  }, [rows, tls, tlMap]);

  const itemsByAlloc = useMemo(() => {
    const m = new Map<string, AllocationItemRow[]>();
    for (const it of items) {
      const list = m.get(it.allocation_id) ?? [];
      list.push(it);
      m.set(it.allocation_id, list);
    }
    return m;
  }, [items]);

  if (!user) return null;

  const weekStart = isoMondayOf();
  const weekEnd = addDaysISO(weekStart, 6);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <CalendarRange size={20} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold leading-tight">
              Weekly TL Allocation
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              Current week: {fmtRange(weekStart, weekEnd)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed text-foreground">
          <p className="mb-1 font-bold text-primary">How it works</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
            <li>Allocate POSM to a TL once per week (deducts new qty from your WD stock).</li>
            <li>TL uses POSM in market — no system entry needed during the week.</li>
            <li>At week end, you physically <strong>verify</strong> remaining stock and close the week. Used = Allocated − Remaining.</li>
            <li>Remaining stock stays with the TL and carries forward as next week's opening stock.</li>
          </ol>
        </div>

        {tlsLoading || allocLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : tls.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center text-xs text-muted-foreground">
            No TLs are linked to your WD yet. Ask an admin to assign.
          </div>
        ) : (
          <div className="space-y-3">
            {byTl.map(({ tl, open, history }) => {
              if (!tl) return null;
              return (
                <TlAllocationCard
                  key={tl.id}
                  tl={tl}
                  open={open}
                  history={history}
                  itemsByAlloc={itemsByAlloc}
                  onChanged={async () => {
                    await Promise.all([refresh(), refreshWdStock()]);
                  }}
                />
              );
            })}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            to="/wd"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to WD
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

// ───────────────────────── per-TL card ─────────────────────────

function TlAllocationCard({
  tl,
  open,
  history,
  itemsByAlloc,
  onChanged,
}: {
  tl: TlOption;
  open: AllocationRow | null;
  history: AllocationRow[];
  itemsByAlloc: Map<string, AllocationItemRow[]>;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"closed" | "create" | "close">("closed");

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            {tl.tl_name}
            {tl.tl_type && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({tl.tl_type})
              </span>
            )}
          </p>
          {open ? (
            <p className="text-[10px] font-bold text-amber-700">
              Week open · {fmtRange(open.week_start, open.week_end)}
            </p>
          ) : (
            <p className="text-[10px] font-semibold text-muted-foreground">
              No allocation for this week
            </p>
          )}
        </div>
        <div className="shrink-0">
          {open ? (
            <button
              onClick={() => setMode(mode === "close" ? "closed" : "close")}
              className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground"
            >
              {mode === "close" ? "Cancel" : "Close week"}
            </button>
          ) : (
            <button
              onClick={() => setMode(mode === "create" ? "closed" : "create")}
              className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-bold text-accent-foreground"
            >
              {mode === "create" ? "Cancel" : "+ Allocate"}
            </button>
          )}
        </div>
      </div>

      {open && mode !== "create" && (
        <OpenWeekSummary
          allocation={open}
          items={itemsByAlloc.get(open.id) ?? []}
        />
      )}

      {open && mode === "close" && (
        <CloseWeekForm
          allocation={open}
          items={itemsByAlloc.get(open.id) ?? []}
          onDone={async () => {
            setMode("closed");
            await onChanged();
          }}
        />
      )}

      {!open && mode === "create" && (
        <CreateAllocationForm
          tl={tl}
          onDone={async () => {
            setMode("closed");
            await onChanged();
          }}
        />
      )}

      {history.length > 0 && (
        <details className="border-t bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">
            Past weeks ({history.length})
          </summary>
          <div className="mt-2 space-y-2">
            {history.map((h) => (
              <PastWeekRow
                key={h.id}
                allocation={h}
                items={itemsByAlloc.get(h.id) ?? []}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function OpenWeekSummary({
  allocation,
  items,
}: {
  allocation: AllocationRow;
  items: AllocationItemRow[];
}) {
  return (
    <div className="border-t bg-muted/10 px-3 py-2">
      <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
        Allocated this week
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No items.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-[11px] font-bold text-foreground">
                {it.material_code}
              </span>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {it.qty_allocated}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Created {new Date(allocation.created_at).toLocaleDateString("en-IN")}
      </p>
    </div>
  );
}

function PastWeekRow({
  allocation,
  items,
}: {
  allocation: AllocationRow;
  items: AllocationItemRow[];
}) {
  const totalAlloc = items.reduce((s, i) => s + i.qty_allocated, 0);
  const totalUsed = items.reduce((s, i) => s + (i.qty_used ?? 0), 0);
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-foreground">
            {fmtRange(allocation.week_start, allocation.week_end)}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock size={10} /> Closed
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] font-bold text-foreground">
            Used {totalUsed} / {totalAlloc}
          </p>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[10px]">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between border-b border-dashed border-muted py-0.5"
            >
              <span className="truncate font-mono text-foreground">
                {it.material_code}
              </span>
              <span className="font-mono text-muted-foreground">
                A {it.qty_allocated} · U {it.qty_used ?? 0} · R {it.qty_remaining ?? 0}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── create allocation ─────────────────────────

type LineDraft = { key: string; material_code: string; qty: string };

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), material_code: "", qty: "" };
}

function CreateAllocationForm({
  tl,
  onDone,
}: {
  tl: TlOption;
  onDone: () => Promise<void> | void;
}) {
  const { stock, loading } = useWdStock();
  const { materials } = useMaterials();
  const matName = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  const stocked = useMemo(
    () =>
      stock
        .filter((r) => r.qty > 0)
        .map((r) => ({ code: r.material_code, qty: r.qty }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [stock],
  );

  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);

  function update(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function allocatedExcept(idx: number, code: string): number {
    return lines.reduce((s, l, i) => {
      if (i === idx || l.material_code !== code) return s;
      const n = parseInt(l.qty, 10);
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }

  const valid =
    lines.length > 0 &&
    lines.every((l) => {
      const n = parseInt(l.qty, 10);
      if (!l.material_code || !Number.isFinite(n) || n <= 0) return false;
      const onHand = stocked.find((s) => s.code === l.material_code)?.qty ?? 0;
      const left = onHand - allocatedExcept(0, l.material_code);
      return n <= left;
    });

  async function submit() {
    if (!valid) {
      toast.error("Fix line items first");
      return;
    }
    setSubmitting(true);
    const items = lines.map((l) => ({
      material_code: l.material_code,
      qty: parseInt(l.qty, 10),
    }));
    const { error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "create_weekly_tl_allocation" as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _wd_tl_id: tl.id, _items: items } as any,
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Weekly allocation created");
    await onDone();
  }

  return (
    <div className="space-y-2 border-t bg-muted/10 p-3">
      <p className="text-[11px] font-bold text-foreground">
        New allocation for {tl.tl_name}
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading WD stock…
        </div>
      ) : stocked.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          You have no WD stock to allocate.
        </p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((l, idx) => {
            const onHand = stocked.find((s) => s.code === l.material_code)?.qty ?? 0;
            const left = onHand - allocatedExcept(idx, l.material_code);
            return (
              <div key={l.key} className="space-y-1 rounded-lg border bg-card p-2">
                <div className="flex items-center gap-2">
                  <select
                    value={l.material_code}
                    onChange={(e) => update(idx, { material_code: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-medium"
                  >
                    <option value="">— Material —</option>
                    {stocked.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} ({m.qty}) · {matName.get(m.code) ?? ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={left || undefined}
                    value={l.qty}
                    onChange={(e) => update(idx, { qty: e.target.value })}
                    placeholder="Qty"
                    className="w-20 rounded-md border bg-background px-2 py-1.5 text-center text-sm font-bold"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLines((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)))
                    }
                    disabled={lines.length === 1}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {l.material_code && (
                  <p className="text-[10px] text-muted-foreground">
                    Available: {Math.max(0, left)} of {onHand}
                  </p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLines((p) => [...p, newLine()])}
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-bold text-primary"
          >
            <Plus size={12} /> Add line
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !valid}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ClipboardList size={16} />
        )}
        Create weekly allocation
      </button>
    </div>
  );
}

// ───────────────────────── close week ─────────────────────────

function CloseWeekForm({
  allocation,
  items,
  onDone,
}: {
  allocation: AllocationRow;
  items: AllocationItemRow[];
  onDone: () => Promise<void> | void;
}) {
  const { user, profile } = useAuth();
  const wd = profile?.wd_code ?? "wd";
  const { materials } = useMaterials();
  const matName = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  const initial = useMemo(
    () =>
      Object.fromEntries(items.map((it) => [it.material_code, "0"])) as Record<
        string,
        string
      >,
    [items],
  );
  const [remaining, setRemaining] = useState<Record<string, string>>(initial);
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const proofRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setRemaining(initial), [initial]);

  const errors = items.map((it) => {
    const n = parseInt(remaining[it.material_code] ?? "0", 10);
    if (!Number.isFinite(n) || n < 0) return "Enter a valid quantity";
    if (n > it.qty_allocated) return `Cannot exceed allocated ${it.qty_allocated}`;
    return null;
  });
  const linesValid = errors.every((e) => !e);
  const valid = linesValid && !!proof?.path;

  async function submit() {
    if (!valid) {
      toast.error(!proof?.path ? "Proof photo is required" : "Fix remaining quantities");
      proofRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    const payload = items.map((it) => ({
      material_code: it.material_code,
      qty_remaining: parseInt(remaining[it.material_code] ?? "0", 10),
    }));
    const { error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "close_weekly_tl_allocation" as any,
      {
        _allocation_id: allocation.id,
        _remaining: payload,
        _proof_image_path: proof!.path,
        _note: note || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Week closed. Remaining stock carried forward to next week.");
    await onDone();
  }

  if (!user) return null;

  return (
    <div className="space-y-3 border-t bg-amber-50/40 p-3">
      <p className="text-[11px] font-bold text-foreground">
        Verify & close week {fmtRange(allocation.week_start, allocation.week_end)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        Physically verify the remaining stock with the TL (or at WD). Enter the verified
        remaining quantity per material. Used = Allocated − Remaining. Remaining stays
        with the TL and carries forward as next week's opening stock.
      </p>

      <div className="space-y-1.5">
        {items.map((it, i) => {
          const n = parseInt(remaining[it.material_code] ?? "0", 10);
          const used =
            Number.isFinite(n) && n >= 0 && n <= it.qty_allocated
              ? it.qty_allocated - n
              : 0;
          return (
            <div key={it.id} className="rounded-lg border bg-card p-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] font-bold text-foreground">
                    {it.material_code}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {matName.get(it.material_code) ?? ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">
                    Allocated
                  </p>
                  <p className="font-mono text-sm font-bold">{it.qty_allocated}</p>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={it.qty_allocated}
                  value={remaining[it.material_code] ?? "0"}
                  onChange={(e) =>
                    setRemaining((p) => ({
                      ...p,
                      [it.material_code]: e.target.value,
                    }))
                  }
                  className={`w-20 rounded-md border bg-background px-2 py-1.5 text-center text-sm font-bold ${
                    errors[i] ? "border-destructive" : ""
                  }`}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                {errors[i] ? (
                  <span className="font-semibold text-destructive">{errors[i]}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Carries forward to next week
                  </span>
                )}
                <span className="font-mono font-bold text-success">Used: {used}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div ref={proofRef}>
        <ProofImageUpload
          wsp={wd}
          userId={user.id}
          kind="dispatch"
          value={proof}
          onChange={setProof}
          label="Verification photo of remaining stock"
        />
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-foreground">
          Note (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          placeholder="Any remarks…"
        />
      </label>

      {!valid && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-2 text-[11px] font-semibold text-amber-800">
          <AlertTriangle size={14} /> Verification photo and valid remaining quantities
          are required.
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <CheckCircle2 size={16} />
        )}
        Confirm & close week
      </button>
      <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <Save size={10} /> Once closed, this week is locked and cannot be edited.
      </p>
    </div>
  );
}
