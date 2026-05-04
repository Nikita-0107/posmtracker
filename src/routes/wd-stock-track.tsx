import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Equal,
  History,
  Boxes,
  PackageX,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
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
  const { stock: systemStock, loading: stockLoading, refresh: refreshStock } = useWdStock();

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
        ) : loading || stockLoading ? (
          <p className="flex items-center justify-center gap-1.5 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : (
          <>
            {tab === "current" && (
              <CurrentView systemStock={systemStock} latest={latestByMaterial} />
            )}
            {tab === "update" && (
              <UpdateForm
                systemStock={systemStock}
                onDone={async () => {
                  await Promise.all([refresh(), refreshStock()]);
                  setTab("history");
                }}
              />
            )}
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

// ──────────────────────────── CURRENT (system stock + last verification) ────────────────────────────

type SystemStockRow = { material_code: string; qty: number };

function CurrentView({
  systemStock,
  latest,
}: {
  systemStock: SystemStockRow[];
  latest: Map<string, Snapshot>;
}) {
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const rows = useMemo(() => {
    return [...systemStock].sort((a, b) => a.material_code.localeCompare(b.material_code));
  }, [systemStock]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <p className="text-sm font-bold text-foreground">No system stock yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Stock appears once WSP dispatches are confirmed by your WD.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <p className="text-[11px] font-bold text-primary">
          Showing system stock. Use Update to verify physical stock.
        </p>
      </div>
      {rows.map((r) => {
        const snap = latest.get(r.material_code);
        const variance = snap ? snap.qty_counted - r.qty : null;
        return (
          <div key={r.material_code} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-bold text-foreground">{r.material_code}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {matMap.get(r.material_code) ?? "—"}
                </p>
                {snap ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Last verified: {snap.snapshot_date} · physical {snap.qty_counted}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-muted-foreground">Not yet physically verified</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">System</p>
                <p className="text-2xl font-bold leading-none text-foreground">{r.qty}</p>
                <VarianceBadge variance={variance} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) {
    return (
      <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
        Not verified
      </span>
    );
  }
  if (variance === 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-success/15 px-1.5 py-0.5 text-[9px] font-bold text-success">
        <Equal size={9} /> Match
      </span>
    );
  }
  if (variance < 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
        <TrendingDown size={9} /> {variance} short
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-warning">
      <TrendingUp size={9} /> +{variance} excess
    </span>
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

function UpdateForm({
  systemStock,
  onDone,
}: {
  systemStock: SystemStockRow[];
  onDone: () => void | Promise<void>;
}) {
  const { profile } = useAuth();
  const wdCode = profile?.wd_code ?? "";
  const userId = profile?.id ?? "";
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  // Only materials currently in WD stock with qty > 0
  const stockRows = useMemo(
    () =>
      [...systemStock]
        .filter((s) => s.qty > 0)
        .sort((a, b) => a.material_code.localeCompare(b.material_code)),
    [systemStock],
  );

  // Map material_code -> physical qty input (string for empty state)
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const validItems = stockRows
    .map((r) => ({ material_code: r.material_code, qty: qtys[r.material_code] ?? "" }))
    .filter((l) => l.qty !== "" && Number(l.qty) >= 0);
  const valid = validItems.length > 0 && proof !== null && date.length > 0;

  async function submit() {
    if (!valid) {
      toast.error("Enter at least one physical qty, a date, and a proof photo");
      return;
    }
    setSubmitting(true);
    try {
      const items = validItems.map((l) => ({
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
      setQtys({});
      setProof(null);
      setNote("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save snapshot");
    } finally {
      setSubmitting(false);
    }
  }

  if (stockRows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <PackageX size={28} className="mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm font-bold text-foreground">No stock to verify</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Stock appears here once WSP dispatches are confirmed received by your WD.
        </p>
      </div>
    );
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
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Materials in stock ({stockRows.length})
          </p>
          <p className="text-[10px] text-muted-foreground">
            {validItems.length} of {stockRows.length} entered
          </p>
        </div>
        {stockRows.map((r) => {
          const sysQty = r.qty;
          const raw = qtys[r.material_code] ?? "";
          const physical = raw === "" ? null : Number(raw);
          // Used = System - Physical (only when physical <= system)
          const used =
            physical !== null && physical <= sysQty ? sysQty - physical : null;
          const extra =
            physical !== null && physical > sysQty ? physical - sysQty : null;
          return (
            <div key={r.material_code} className="rounded-xl border bg-card p-3">
              <div className="mb-2 min-w-0">
                <p className="truncate font-mono text-xs font-bold text-foreground">
                  {r.material_code}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {matMap.get(r.material_code) ?? "—"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/40 p-2 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    System
                  </p>
                  <p className="font-mono text-base font-bold text-foreground">{sysQty}</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-1.5 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-primary">
                    Physical
                  </p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="—"
                    value={raw}
                    onChange={(e) =>
                      setQtys((prev) => ({ ...prev, [r.material_code]: e.target.value }))
                    }
                    className="mt-0.5 w-full bg-transparent text-center font-mono text-base font-bold text-foreground outline-none"
                  />
                </div>
                <div className="rounded-lg bg-success/10 p-2 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-success">
                    Used
                  </p>
                  <p className="font-mono text-base font-bold text-success">
                    {used !== null ? used : "—"}
                  </p>
                </div>
              </div>
              {extra !== null && (
                <p className="mt-1.5 text-center text-[10px] font-semibold text-muted-foreground">
                  +{extra} extra found vs system
                </p>
              )}
            </div>
          );
        })}
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
