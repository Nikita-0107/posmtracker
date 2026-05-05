import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, History, Loader2, Send, Undo2, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
import { useTlsForMyWd, type TlOption } from "@/hooks/use-tl-issuances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-issue-tl")({
  component: TlAllocationPage,
  head: () => ({
    meta: [
      { title: "TL Allocation — POSM Tracker" },
      {
        name: "description",
        content: "Allocate POSM stock to Team Leaders and record returns.",
      },
    ],
  }),
});

// ─────────────── data: per-TL pending (allocated - returned) ───────────────

type TlBalance = {
  tlId: string;
  byMat: Map<string, { allocated: number; returned: number; pending: number }>;
};

function useTlBalances(refreshKey: number) {
  const { tls } = useTlsForMyWd();
  const [balances, setBalances] = useState<Map<string, TlBalance>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (tls.length === 0) {
      setBalances(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const tlIds = tls.map((t) => t.id);

    // Issuances headers for these TLs
    const { data: issRows } = await supabase
      .from("tl_issuances")
      .select("id, wd_tl_id")
      .in("wd_tl_id", tlIds);
    const issIds = (issRows ?? []).map((r) => r.id);
    const issToTl = new Map((issRows ?? []).map((r) => [r.id, r.wd_tl_id as string]));

    const { data: lineRows } = issIds.length
      ? await supabase
          .from("tl_issuance_items")
          .select("issuance_id, material_code, qty_issued")
          .in("issuance_id", issIds)
      : { data: [] as Array<{ issuance_id: string; material_code: string; qty_issued: number }> };

    // Returns
    const { data: retRows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_returns" as any)
      .select("wd_tl_id, material_code, qty")
      .in("wd_tl_id", tlIds);

    const map = new Map<string, TlBalance>();
    for (const t of tls) map.set(t.id, { tlId: t.id, byMat: new Map() });

    for (const l of lineRows ?? []) {
      const tlId = issToTl.get(l.issuance_id as string);
      if (!tlId) continue;
      const bal = map.get(tlId)!;
      const cur = bal.byMat.get(l.material_code) ?? { allocated: 0, returned: 0, pending: 0 };
      cur.allocated += l.qty_issued;
      bal.byMat.set(l.material_code, cur);
    }
    for (const r of (retRows ?? []) as Array<{ wd_tl_id: string; material_code: string; qty: number }>) {
      const bal = map.get(r.wd_tl_id);
      if (!bal) continue;
      const cur = bal.byMat.get(r.material_code) ?? { allocated: 0, returned: 0, pending: 0 };
      cur.returned += r.qty;
      bal.byMat.set(r.material_code, cur);
    }
    for (const bal of map.values()) {
      for (const [k, v] of bal.byMat) {
        v.pending = v.allocated - v.returned;
        bal.byMat.set(k, v);
      }
    }
    setBalances(map);
    setLoading(false);
  }, [tls]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return { balances, loading, refresh };
}

// ───────────────────────── page ─────────────────────────

type Tab = "allocate" | "return" | "history";

function TlAllocationPage() {
  const { user } = useAuth();
  const { tls, loading: tlsLoading } = useTlsForMyWd();
  const [tab, setTab] = useState<Tab>("allocate");
  const [refreshKey, setRefreshKey] = useState(0);
  const { balances, loading: balLoading } = useTlBalances(refreshKey);
  const { refresh: refreshWdStock } = useWdStock();

  const bumpAll = async () => {
    setRefreshKey((k) => k + 1);
    await refreshWdStock();
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ArrowLeftRight size={20} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">TL Allocation</h2>
            <p className="text-[11px] text-muted-foreground">
              Send stock to TLs · Record returns · Track pending
            </p>
          </div>
        </div>

        {/* Horizontal TL summary */}
        <TlSummaryStrip
          tls={tls}
          balances={balances}
          loading={tlsLoading || balLoading}
        />

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-muted/40 p-1">
          {(
            [
              { k: "allocate", l: "Allocate", i: <Send size={14} /> },
              { k: "return", l: "Return", i: <Undo2 size={14} /> },
              { k: "history", l: "History", i: <History size={14} /> },
            ] as { k: Tab; l: string; i: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                tab === t.k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {t.i}
              {t.l}
            </button>
          ))}
        </div>

        {tab === "allocate" && <AllocateTab tls={tls} onDone={bumpAll} />}
        {tab === "return" && (
          <ReturnTab tls={tls} balances={balances} onDone={bumpAll} />
        )}
        {tab === "history" && <HistoryTab tls={tls} refreshKey={refreshKey} />}

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

// ───────────────────────── horizontal summary strip ─────────────────────────

function TlSummaryStrip({
  tls,
  balances,
  loading,
}: {
  tls: TlOption[];
  balances: Map<string, TlBalance>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Loading TLs…
      </div>
    );
  }
  if (tls.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        No TLs linked to your WD yet.
      </div>
    );
  }
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
      {tls.map((tl) => {
        const bal = balances.get(tl.id);
        const pending = bal
          ? Array.from(bal.byMat.values()).reduce((s, v) => s + Math.max(v.pending, 0), 0)
          : 0;
        return (
          <div
            key={tl.id}
            className="flex min-w-[140px] snap-start flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-muted-foreground" />
              <p className="truncate text-xs font-bold text-foreground">{tl.tl_name}</p>
            </div>
            <p className="text-[10px] uppercase text-muted-foreground">Pending</p>
            <p className="font-mono text-base font-bold text-primary">{pending}</p>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── ALLOCATE TAB ─────────────────────────

type LineDraft = { code: string; qty: string };

function AllocateTab({
  tls,
  onDone,
}: {
  tls: TlOption[];
  onDone: () => Promise<void> | void;
}) {
  const [tlId, setTlId] = useState<string>("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { stock, loading: stockLoading } = useWdStock();
  const { materials } = useMaterials();
  const matName = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const stocked = useMemo(
    () =>
      stock
        .filter((r) => r.qty > 0)
        .sort((a, b) => a.material_code.localeCompare(b.material_code)),
    [stock],
  );

  function pickMaterial(code: string) {
    if (lines.find((l) => l.code === code)) return;
    setLines((p) => [...p, { code, qty: "" }]);
  }
  function removeLine(code: string) {
    setLines((p) => p.filter((l) => l.code !== code));
  }
  function setQty(code: string, qty: string) {
    setLines((p) => p.map((l) => (l.code === code ? { ...l, qty } : l)));
  }

  const valid =
    tlId &&
    lines.length > 0 &&
    lines.every((l) => {
      const n = parseInt(l.qty, 10);
      const onHand = stocked.find((s) => s.material_code === l.code)?.qty ?? 0;
      return Number.isFinite(n) && n > 0 && n <= onHand;
    });

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    const items = lines.map((l) => ({ material_code: l.code, qty: parseInt(l.qty, 10) }));
    const { error } = await supabase.rpc("issue_to_tl_v2", {
      _wd_tl_id: tlId,
      _issue_date: new Date().toISOString().slice(0, 10),
      _items: items,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stock sent to TL");
    setLines([]);
    setTlId("");
    await onDone();
  }

  const guidance = !tlId
    ? "Select a TL to continue"
    : lines.length === 0
      ? "Add at least one material"
      : !valid
        ? "Fix quantity issues"
        : "";

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">
      {/* Step 1: pick TL — horizontal chips */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
          1. Send to TL
        </p>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {tls.map((t) => (
            <button
              key={t.id}
              onClick={() => setTlId(t.id)}
              className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                tlId === t.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {t.tl_name}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: materials chips */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
          2. Tap material to add
        </p>
        {stockLoading ? (
          <p className="text-xs text-muted-foreground">Loading stock…</p>
        ) : stocked.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stock available.</p>
        ) : (
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {stocked.map((s) => {
              const sel = !!lines.find((l) => l.code === s.material_code);
              return (
                <button
                  key={s.material_code}
                  onClick={() => pickMaterial(s.material_code)}
                  disabled={sel}
                  className={`shrink-0 snap-start rounded-xl border px-3 py-2 text-left transition ${
                    sel
                      ? "border-muted bg-muted/40 opacity-60"
                      : "border-border bg-background hover:border-primary"
                  }`}
                >
                  <p className="font-mono text-[11px] font-bold text-foreground">
                    {s.material_code}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground" style={{ maxWidth: 140 }}>
                    {matName.get(s.material_code) ?? "—"}
                  </p>
                  <p className="text-[10px] font-bold text-primary">{s.qty} available</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 3: selected lines (vertical for inputs) */}
      {lines.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
            3. Quantities
          </p>
          <div className="space-y-1.5">
            {lines.map((l) => {
              const onHand = stocked.find((s) => s.material_code === l.code)?.qty ?? 0;
              const n = parseInt(l.qty, 10);
              const bad = l.qty !== "" && (!Number.isFinite(n) || n <= 0 || n > onHand);
              return (
                <div
                  key={l.code}
                  className="flex items-center gap-2 rounded-lg border bg-background p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold">{l.code}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {onHand} available
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={onHand}
                    inputMode="numeric"
                    placeholder="Qty"
                    value={l.qty}
                    onChange={(e) => setQty(l.code, e.target.value)}
                    className={`w-20 rounded-md border bg-background px-2 py-1.5 text-right font-mono text-sm ${
                      bad ? "border-destructive" : "border-border"
                    }`}
                  />
                  <button
                    onClick={() => removeLine(l.code)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!valid || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        Send Stock
      </button>
      {!valid && guidance && (
        <p className="text-center text-[10px] text-muted-foreground">{guidance}</p>
      )}
    </div>
  );
}

// ───────────────────────── RETURN TAB ─────────────────────────

function ReturnTab({
  tls,
  balances,
  onDone,
}: {
  tls: TlOption[];
  balances: Map<string, TlBalance>;
  onDone: () => Promise<void> | void;
}) {
  const [tlId, setTlId] = useState<string>("");
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setQtyMap({});
  }, [tlId]);

  const pendingMats = useMemo(() => {
    const bal = balances.get(tlId);
    if (!bal) return [] as { code: string; pending: number }[];
    return Array.from(bal.byMat.entries())
      .map(([code, v]) => ({ code, pending: v.pending }))
      .filter((x) => x.pending > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [balances, tlId]);

  const items = pendingMats
    .map((m) => ({ code: m.code, qty: parseInt(qtyMap[m.code] ?? "", 10), max: m.pending }))
    .filter((x) => Number.isFinite(x.qty) && x.qty > 0);

  const valid =
    tlId &&
    items.length > 0 &&
    items.every((x) => x.qty > 0 && x.qty <= x.max);

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    const { error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "return_from_tl" as any,
      {
        _wd_tl_id: tlId,
        _items: items.map((x) => ({ material_code: x.code, qty: x.qty })),
        _note: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Return recorded");
    setQtyMap({});
    setTlId("");
    await onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
          1. Return from TL
        </p>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {tls.map((t) => {
            const bal = balances.get(t.id);
            const pending = bal
              ? Array.from(bal.byMat.values()).reduce((s, v) => s + Math.max(v.pending, 0), 0)
              : 0;
            return (
              <button
                key={t.id}
                onClick={() => setTlId(t.id)}
                disabled={pending === 0}
                className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  tlId === t.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : pending === 0
                      ? "border-muted bg-muted/40 text-muted-foreground"
                      : "border-border bg-background text-foreground"
                }`}
              >
                {t.tl_name} · {pending}
              </button>
            );
          })}
        </div>
      </div>

      {tlId && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
            2. Returned quantities
          </p>
          {pendingMats.length === 0 ? (
            <p className="rounded-lg border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
              Nothing pending with this TL.
            </p>
          ) : (
            <div className="space-y-1.5">
              {pendingMats.map((m) => {
                const v = qtyMap[m.code] ?? "";
                const n = parseInt(v, 10);
                const bad = v !== "" && (!Number.isFinite(n) || n < 0 || n > m.pending);
                return (
                  <div
                    key={m.code}
                    className="flex items-center gap-2 rounded-lg border bg-background p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold">{m.code}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Pending: {m.pending}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={m.pending}
                      inputMode="numeric"
                      placeholder="0"
                      value={v}
                      onChange={(e) =>
                        setQtyMap((p) => ({ ...p, [m.code]: e.target.value }))
                      }
                      className={`w-20 rounded-md border bg-background px-2 py-1.5 text-right font-mono text-sm ${
                        bad ? "border-destructive" : "border-border"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!valid || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
        Record Return
      </button>
    </div>
  );
}

// ───────────────────────── HISTORY TAB ─────────────────────────

type HistEntry = {
  id: string;
  kind: "alloc" | "return";
  date: string;
  tlId: string;
  material_code: string;
  qty: number;
};

function HistoryTab({ tls, refreshKey }: { tls: TlOption[]; refreshKey: number }) {
  const tlMap = useMemo(() => new Map(tls.map((t) => [t.id, t.tl_name])), [tls]);
  const [entries, setEntries] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      if (tls.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }
      const tlIds = tls.map((t) => t.id);
      const { data: issRows } = await supabase
        .from("tl_issuances")
        .select("id, wd_tl_id, issue_date, created_at")
        .in("wd_tl_id", tlIds)
        .order("created_at", { ascending: false })
        .limit(200);
      const issIds = (issRows ?? []).map((r) => r.id);
      const issMap = new Map(
        (issRows ?? []).map((r) => [r.id, { tl: r.wd_tl_id as string, date: r.issue_date }]),
      );
      const { data: lineRows } = issIds.length
        ? await supabase
            .from("tl_issuance_items")
            .select("id, issuance_id, material_code, qty_issued")
            .in("issuance_id", issIds)
        : { data: [] as Array<{ id: string; issuance_id: string; material_code: string; qty_issued: number }> };
      const { data: retRows } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("tl_returns" as any)
        .select("id, wd_tl_id, material_code, qty, created_at")
        .in("wd_tl_id", tlIds)
        .order("created_at", { ascending: false })
        .limit(200);

      const allocs: HistEntry[] = (lineRows ?? []).map((l) => {
        const head = issMap.get(l.issuance_id as string);
        return {
          id: l.id,
          kind: "alloc" as const,
          date: head?.date ?? "",
          tlId: head?.tl ?? "",
          material_code: l.material_code,
          qty: l.qty_issued,
        };
      });
      const returns: HistEntry[] = ((retRows ?? []) as Array<{
        id: string;
        wd_tl_id: string;
        material_code: string;
        qty: number;
        created_at: string;
      }>).map((r) => ({
        id: r.id,
        kind: "return" as const,
        date: r.created_at.slice(0, 10),
        tlId: r.wd_tl_id,
        material_code: r.material_code,
        qty: r.qty,
      }));

      const merged = [...allocs, ...returns].sort((a, b) => b.date.localeCompare(a.date));
      if (alive) {
        setEntries(merged);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tls, refreshKey]);

  if (loading) {
    return (
      <div className="flex justify-center py-6 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-4 text-center text-xs text-muted-foreground">
        No history yet.
      </div>
    );
  }
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {entries.map((e) => (
        <div key={`${e.kind}-${e.id}`} className="flex items-center gap-2 px-3 py-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              e.kind === "alloc"
                ? "bg-primary/10 text-primary"
                : "bg-accent/10 text-accent"
            }`}
          >
            {e.kind === "alloc" ? "OUT" : "IN"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">
              {tlMap.get(e.tlId) ?? "—"} · <span className="font-mono">{e.material_code}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(e.date + "T00:00:00").toLocaleDateString("en-IN")}
            </p>
          </div>
          <p className="font-mono text-sm font-bold">{e.qty}</p>
        </div>
      ))}
    </div>
  );
}
