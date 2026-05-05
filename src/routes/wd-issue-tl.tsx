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

type TlActivity = {
  lastActivityAt: string | null; // ISO
  reason: null | {
    id: string;
    reason: "on_leave" | "no_requirement" | "stock_sufficient" | "other";
    comment: string | null;
    leave_until: string | null;
    expires_at: string | null;
    created_at: string;
  };
};

const INACTIVITY_DAYS = 7;

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

function reasonIsActive(r: TlActivity["reason"]): boolean {
  if (!r) return false;
  const now = Date.now();
  if (r.leave_until) {
    return new Date(r.leave_until + "T23:59:59").getTime() >= now;
  }
  if (r.expires_at) {
    return new Date(r.expires_at).getTime() >= now;
  }
  // No explicit expiry: valid for INACTIVITY_DAYS from creation
  return now - new Date(r.created_at).getTime() < INACTIVITY_DAYS * 86400000;
}

function reasonLabel(r: NonNullable<TlActivity["reason"]>): string {
  if (r.reason === "on_leave" && r.leave_until) {
    const d = new Date(r.leave_until + "T00:00:00");
    return `On Leave (till ${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})`;
  }
  const map: Record<string, string> = {
    on_leave: "On Leave",
    no_requirement: "No requirement",
    stock_sufficient: "Stock sufficient",
    other: "No activity (Marked)",
  };
  return map[r.reason] ?? "No activity (Marked)";
}

function useTlActivity(tls: TlOption[], refreshKey: number) {
  const [activity, setActivity] = useState<Map<string, TlActivity>>(new Map());

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (tls.length === 0) {
        setActivity(new Map());
        return;
      }
      const tlIds = tls.map((t) => t.id);
      const [{ data: issRows }, retRes, reasonRes] = await Promise.all([
        supabase
          .from("tl_issuances")
          .select("wd_tl_id, created_at")
          .in("wd_tl_id", tlIds)
          .order("created_at", { ascending: false }),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("tl_returns" as any)
          .select("wd_tl_id, created_at")
          .in("wd_tl_id", tlIds)
          .order("created_at", { ascending: false }),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("tl_inactivity_reasons" as any)
          .select("id, wd_tl_id, reason, comment, leave_until, expires_at, created_at")
          .in("wd_tl_id", tlIds)
          .order("created_at", { ascending: false }),
      ]);

      const lastBy = new Map<string, string>();
      for (const r of (issRows ?? []) as { wd_tl_id: string; created_at: string }[]) {
        const cur = lastBy.get(r.wd_tl_id);
        if (!cur || r.created_at > cur) lastBy.set(r.wd_tl_id, r.created_at);
      }
      for (const r of (retRes.data ?? []) as unknown as { wd_tl_id: string; created_at: string }[]) {
        const cur = lastBy.get(r.wd_tl_id);
        if (!cur || r.created_at > cur) lastBy.set(r.wd_tl_id, r.created_at);
      }

      const reasonBy = new Map<string, TlActivity["reason"]>();
      for (const r of (reasonRes.data ?? []) as unknown as Array<{
        id: string;
        wd_tl_id: string;
        reason: TlActivity["reason"] extends null ? never : NonNullable<TlActivity["reason"]>["reason"];
        comment: string | null;
        leave_until: string | null;
        expires_at: string | null;
        created_at: string;
      }>) {
        if (reasonBy.has(r.wd_tl_id)) continue; // first (newest) wins
        reasonBy.set(r.wd_tl_id, {
          id: r.id,
          reason: r.reason,
          comment: r.comment,
          leave_until: r.leave_until,
          expires_at: r.expires_at,
          created_at: r.created_at,
        });
      }

      const out = new Map<string, TlActivity>();
      for (const t of tls) {
        out.set(t.id, {
          lastActivityAt: lastBy.get(t.id) ?? null,
          reason: reasonBy.get(t.id) ?? null,
        });
      }
      if (alive) setActivity(out);
    })();
    return () => {
      alive = false;
    };
  }, [tls, refreshKey]);

  return activity;
}

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
    for (const r of (retRows ?? []) as unknown as Array<{ wd_tl_id: string; material_code: string; qty: number }>) {
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
  const activity = useTlActivity(tls, refreshKey);
  const [reasonFor, setReasonFor] = useState<TlOption | null>(null);

  const inactiveCount = useMemo(() => {
    let n = 0;
    for (const t of tls) {
      const a = activity.get(t.id);
      if (!a) continue;
      const inactive = daysSince(a.lastActivityAt) >= INACTIVITY_DAYS;
      const marked = reasonIsActive(a.reason);
      if (inactive && !marked) n++;
    }
    return n;
  }, [tls, activity]);

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
              Send stock to TLs · Record returns · Track TL stock
            </p>
          </div>
          {inactiveCount > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              Inactive TLs: {inactiveCount}
            </span>
          )}
        </div>

        {/* Horizontal TL summary */}
        <TlSummaryStrip
          tls={tls}
          balances={balances}
          activity={activity}
          loading={tlsLoading || balLoading}
          onMarkReason={(t) => setReasonFor(t)}
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

      {reasonFor && (
        <MarkReasonModal
          tl={reasonFor}
          onClose={() => setReasonFor(null)}
          onSaved={async () => {
            setReasonFor(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </AppShell>
  );
}


// ───────────────────────── TL label helpers ─────────────────────────

function tlMeta(tl: { legacy_tl_id: number | null; tl_type: string | null }) {
  const parts: string[] = [];
  if (tl.legacy_tl_id != null) parts.push(String(tl.legacy_tl_id));
  if (tl.tl_type) parts.push(tl.tl_type);
  return parts.join(" • ");
}

function TlLabel({
  tl,
  bold = true,
  nameClass = "",
  metaClass = "",
}: {
  tl: TlOption;
  bold?: boolean;
  nameClass?: string;
  metaClass?: string;
}) {
  const meta = tlMeta(tl);
  return (
    <span className="inline-flex items-baseline gap-1 min-w-0">
      <span className={`${bold ? "font-bold" : ""} truncate ${nameClass}`}>{tl.tl_name}</span>
      {meta && (
        <span className={`text-[10px] font-normal opacity-70 ${metaClass}`}>({meta})</span>
      )}
    </span>
  );
}

// ───────────────────────── horizontal summary strip ─────────────────────────

function TlSummaryStrip({
  tls,
  balances,
  activity,
  loading,
  onMarkReason,
}: {
  tls: TlOption[];
  balances: Map<string, TlBalance>;
  activity: Map<string, TlActivity>;
  loading: boolean;
  onMarkReason: (tl: TlOption) => void;
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
        const a = activity.get(tl.id);
        const inactive = a ? daysSince(a.lastActivityAt) >= INACTIVITY_DAYS : false;
        const marked = a ? reasonIsActive(a.reason) : false;
        return (
          <div
            key={tl.id}
            className="flex min-w-[160px] snap-start flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Users size={12} className="text-muted-foreground shrink-0" />
              <TlLabel tl={tl} nameClass="text-sm text-foreground" metaClass="text-muted-foreground" />
            </div>
            <p className="text-[10px] uppercase text-muted-foreground">AVAILABLE STOCK WITH TL</p>
            <p className="font-mono text-base font-bold text-primary">{pending}</p>
            {marked && a?.reason && (
              <p className="truncate text-[10px] font-semibold text-muted-foreground">
                {reasonLabel(a.reason)}
              </p>
            )}
            {inactive && !marked && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  ⚠ No activity for {INACTIVITY_DAYS} days
                </p>
                <button
                  onClick={() => onMarkReason(tl)}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                >
                  Mark Reason
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── MARK REASON MODAL ─────────────────────────

const REASON_OPTIONS: { v: "on_leave" | "no_requirement" | "stock_sufficient" | "other"; l: string }[] = [
  { v: "on_leave", l: "On Leave" },
  { v: "no_requirement", l: "No requirement" },
  { v: "stock_sufficient", l: "Stock already sufficient" },
  { v: "other", l: "Other" },
];

function MarkReasonModal({
  tl,
  onClose,
  onSaved,
}: {
  tl: TlOption;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<typeof REASON_OPTIONS[number]["v"]>("on_leave");
  const [leaveUntil, setLeaveUntil] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!user) return;
    if (reason === "on_leave" && !leaveUntil) {
      toast.error("Pick a date for leave end");
      return;
    }
    setSubmitting(true);
    const expires_at =
      reason === "on_leave"
        ? null
        : new Date(Date.now() + INACTIVITY_DAYS * 86400000).toISOString();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_inactivity_reasons" as any)
      .insert({
        wd_tl_id: tl.id,
        wd_code: tl.wd_code,
        reason,
        comment: comment.trim() || null,
        leave_until: reason === "on_leave" ? leaveUntil : null,
        expires_at,
        created_by: user.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reason recorded");
    await onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Mark reason</p>
            <p className="truncate text-sm font-bold">
              <TlLabel tl={tl} />
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {REASON_OPTIONS.map((o) => (
            <button
              key={o.v}
              onClick={() => setReason(o.v)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                reason === o.v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              <span className="font-semibold">{o.l}</span>
              {reason === o.v && <span className="text-xs text-primary">✓</span>}
            </button>
          ))}
        </div>

        {reason === "on_leave" && (
          <div className="mt-3">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              On leave till
            </label>
            <input
              type="date"
              value={leaveUntil}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setLeaveUntil(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="mt-3">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Comment (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <button
          onClick={save}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Save reason
        </button>
      </div>
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
  const { stock, loading: stockLoading, wdCode } = useWdStock();
  const { materials } = useMaterials();
  const matName = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  // In-transit = pending outgoing inter-WD transfers from this WD
  const [inTransit, setInTransit] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!wdCode) {
      setInTransit(new Map());
      return;
    }
    let alive = true;
    void (async () => {
      const { data: trs } = await supabase
        .from("wd_transfers")
        .select("id")
        .eq("from_wd_code", wdCode)
        .eq("status", "pending");
      const ids = (trs ?? []).map((r) => r.id);
      if (ids.length === 0) {
        if (alive) setInTransit(new Map());
        return;
      }
      const { data: items } = await supabase
        .from("wd_transfer_items")
        .select("material_code, qty_requested, item_status")
        .in("transfer_id", ids);
      const m = new Map<string, number>();
      for (const it of items ?? []) {
        if (it.item_status !== "pending") continue;
        m.set(it.material_code, (m.get(it.material_code) ?? 0) + it.qty_requested);
      }
      if (alive) setInTransit(m);
    })();
    return () => {
      alive = false;
    };
  }, [wdCode]);

  const stocked = useMemo(
    () =>
      stock
        .map((r) => ({
          material_code: r.material_code,
          qty: r.qty,
          inTransit: inTransit.get(r.material_code) ?? 0,
          available: Math.max(0, r.qty - (inTransit.get(r.material_code) ?? 0)),
        }))
        .filter((r) => r.available > 0)
        .sort((a, b) => a.material_code.localeCompare(b.material_code)),
    [stock, inTransit],
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
      const avail = stocked.find((s) => s.material_code === l.code)?.available ?? 0;
      return Number.isFinite(n) && n > 0 && n <= avail;
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
              <TlLabel tl={t} />
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
                  <p className="text-[11px] font-bold text-primary">Available: {s.available}</p>
                  {s.inTransit > 0 && (
                    <p className="text-[10px] text-muted-foreground">{s.inTransit} in transit</p>
                  )}
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
              const row = stocked.find((s) => s.material_code === l.code);
              const avail = row?.available ?? 0;
              const transit = row?.inTransit ?? 0;
              const n = parseInt(l.qty, 10);
              const bad = l.qty !== "" && (!Number.isFinite(n) || n <= 0 || n > avail);
              return (
                <div
                  key={l.code}
                  className="flex items-center gap-2 rounded-lg border bg-background p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold">{l.code}</p>
                    <p className="text-[11px] font-bold text-foreground">
                      Available: {avail}
                    </p>
                    {transit > 0 && (
                      <p className="text-[10px] text-muted-foreground">{transit} in transit</p>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={avail}
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
                <TlLabel tl={t} /> · {pending}
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
              No stock with this TL.
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
                        AVAILABLE STOCK WITH TL: {m.pending}
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
  const tlMap = useMemo(() => new Map(tls.map((t) => [t.id, t])), [tls]);
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
      const returns: HistEntry[] = ((retRows ?? []) as unknown as Array<{
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
              {tlMap.get(e.tlId) ? <TlLabel tl={tlMap.get(e.tlId)!} /> : "—"} · <span className="font-mono">{e.material_code}</span>
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
