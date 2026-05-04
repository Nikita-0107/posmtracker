import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Loader2,
  Plus,
  Minus,
  X,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Equal,
  History,
  Boxes,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-stock-track")({
  component: WdStockTrackPage,
  head: () => ({
    meta: [
      { title: "Stock Tracking (WD Level) — POSM Tracker" },
      { name: "description", content: "Periodic WD-level physical stock tracking with proof and trend." },
    ],
  }),
});

type Snapshot = {
  id: string;
  wd_code: string;
  material_code: string;
  qty_counted: number;
  qty_previous: number | null;
  qty_change: number | null;
  snapshot_date: string;
  proof_image_path: string;
  note: string | null;
  batch_id: string;
  created_at: string;
};

function WdStockTrackPage() {
  const { profile } = useAuth();
  const wdCode = profile?.wd_code ?? null;
  const [tab, setTab] = useState<"current" | "update" | "history">("current");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    let q = supabase
      .from("wd_stock_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (wdCode) q = q.eq("wd_code", wdCode);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      toast.error("Failed to load snapshots");
      setSnapshots([]);
    } else {
      setSnapshots((data ?? []) as Snapshot[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wdCode]);

  // Latest snapshot per material
  const latestByMaterial = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const s of snapshots) {
      if (!map.has(s.material_code)) map.set(s.material_code, s);
    }
    return map;
  }, [snapshots]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardCheck size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">Stock Tracking (WD Level)</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {wdCode ? `WD ${wdCode} · pilot module` : "No WD assigned"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-card p-1">
          <TabBtn label="Current" icon={Boxes} active={tab === "current"} onClick={() => setTab("current")} />
          <TabBtn label="Update" icon={Plus} active={tab === "update"} onClick={() => setTab("update")} />
          <TabBtn label="History" icon={History} active={tab === "history"} onClick={() => setTab("history")} />
        </div>

        {!wdCode ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <p className="text-sm font-bold text-foreground">No WD assigned</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Ask an admin to assign your WD code.</p>
          </div>
        ) : loading ? (
          <p className="flex items-center justify-center gap-1.5 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : (
          <>
            {tab === "current" && <CurrentView latest={latestByMaterial} />}
            {tab === "update" && <UpdateForm onDone={async () => { await refresh(); setTab("history"); }} />}
            {tab === "history" && <HistoryView snapshots={snapshots} />}
          </>
        )}

        <div className="pt-2 text-center">
          <Link to="/wd" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to WD home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function TabBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// ──────────────────────────── CURRENT (latest snapshot per material) ────────────────────────────

function CurrentView({ latest }: { latest: Map<string, Snapshot> }) {
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const rows = useMemo(() => {
    return Array.from(latest.values()).sort((a, b) => a.material_code.localeCompare(b.material_code));
  }, [latest]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <p className="text-sm font-bold text-foreground">No stock counts yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Tap <span className="font-bold">Update</span> to record your first physical count.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div key={s.material_code} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs font-bold text-foreground">{s.material_code}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {matMap.get(s.material_code) ?? "—"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Last counted: {s.snapshot_date}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold leading-none text-foreground">{s.qty_counted}</p>
              <ChangeBadge change={s.qty_change} prev={s.qty_previous} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeBadge({ change, prev }: { change: number | null; prev: number | null }) {
  if (prev === null || change === null) {
    return <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">First count</span>;
  }
  if (change === 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
        <Equal size={9} /> No change
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-success/15 px-1.5 py-0.5 text-[9px] font-bold text-success">
        <TrendingDown size={9} /> {change} (used)
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-warning">
      <TrendingUp size={9} /> +{change}
    </span>
  );
}

// ──────────────────────────── UPDATE FORM ────────────────────────────

type DraftLine = { material_code: string; qty: string };

function UpdateForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const { profile } = useAuth();
  const wdCode = profile?.wd_code ?? "";
  const userId = profile?.id ?? "";
  const { materials } = useMaterials();

  const [lines, setLines] = useState<DraftLine[]>([{ material_code: "", qty: "" }]);
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const usedCodes = new Set(lines.map((l) => l.material_code).filter(Boolean));

  function update(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { material_code: "", qty: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const validLines = lines.filter((l) => l.material_code && l.qty !== "" && Number(l.qty) >= 0);
  const valid = validLines.length > 0 && proof !== null && date.length > 0;

  async function submit() {
    if (!valid) {
      toast.error("Add at least one item, a date, and a proof photo");
      return;
    }
    setSubmitting(true);
    try {
      const items = validLines.map((l) => ({
        material_code: l.material_code,
        qty_counted: Number(l.qty),
      }));
      const { data, error } = await supabase.rpc("record_wd_stock_snapshot", {
        _proof_image_path: proof!.path,
        _items: items,
        _snapshot_date: date,
        _note: note.trim() || undefined,
      });
      if (error) throw new Error(error.message);
      toast.success(`Stock count saved (${items.length} item${items.length > 1 ? "s" : ""})`, {
        description: data ? `Batch ${String(data).slice(0, 8)}` : undefined,
      });
      setLines([{ material_code: "", qty: "" }]);
      setProof(null);
      setNote("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save snapshot");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-foreground">Snapshot Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Items</p>
        {lines.map((line, i) => {
          const options = materials.filter(
            (m) => m.code === line.material_code || !usedCodes.has(m.code),
          );
          return (
            <div key={i} className="rounded-xl border bg-card p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <select
                    value={line.material_code}
                    onChange={(e) => update(i, { material_code: e.target.value })}
                    className="w-full rounded-lg border bg-background px-2 py-2 text-xs"
                  >
                    <option value="">Select material…</option>
                    {options.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Physical qty"
                    value={line.qty}
                    onChange={(e) => update(i, { qty: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Remove item"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addLine}
          className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-2 text-xs font-bold text-primary"
        >
          <Plus size={14} /> Add another item
        </button>
      </div>

      <div className="rounded-xl border bg-card p-3 space-y-2">
        <ProofImageUpload
          wsp={wdCode}
          userId={userId}
          kind="dispatch"
          value={proof}
          onChange={setProof}
          label="Proof Photo (physical stock)"
        />
      </div>

      <textarea
        placeholder="Optional note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full rounded-xl border bg-card px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        disabled={!valid || submitting}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
        Save Stock Count
      </button>
    </div>
  );
}

// ──────────────────────────── HISTORY ────────────────────────────

function HistoryView({ snapshots }: { snapshots: Snapshot[] }) {
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  // Group by batch_id
  const batches = useMemo(() => {
    const map = new Map<string, Snapshot[]>();
    for (const s of snapshots) {
      const list = map.get(s.batch_id) ?? [];
      list.push(s);
      map.set(s.batch_id, list);
    }
    return Array.from(map.entries())
      .map(([id, items]) => ({
        batch_id: id,
        items,
        date: items[0].snapshot_date,
        created_at: items[0].created_at,
        note: items[0].note,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [snapshots]);

  if (batches.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <p className="text-sm font-bold text-foreground">No history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <BatchCard key={b.batch_id} batch={b} matMap={matMap} />
      ))}
    </div>
  );
}

function BatchCard({
  batch,
  matMap,
}: {
  batch: { batch_id: string; items: Snapshot[]; date: string; created_at: string; note: string | null };
  matMap: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground">
            {batch.date} · {batch.items.length} item{batch.items.length > 1 ? "s" : ""}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Recorded {new Date(batch.created_at).toLocaleString()}
          </p>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="space-y-1.5 border-t bg-muted/20 p-2">
          {batch.note && (
            <p className="rounded-md bg-card px-2 py-1.5 text-[11px] italic text-muted-foreground">
              "{batch.note}"
            </p>
          )}
          {batch.items.map((s) => (
            <div key={s.id} className="rounded-md border bg-card p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] font-bold">{s.material_code}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {matMap.get(s.material_code) ?? "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-bold">{s.qty_counted}</p>
                  {s.qty_previous !== null && (
                    <p className="text-[10px] text-muted-foreground">prev: {s.qty_previous}</p>
                  )}
                  <ChangeBadge change={s.qty_change} prev={s.qty_previous} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
