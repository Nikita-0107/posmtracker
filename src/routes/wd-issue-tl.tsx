import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, History, Loader2, Search, Send, Undo2, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
import { useTlsForMyWd, type TlOption } from "@/hooks/use-tl-issuances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { matchesSearch } from "@/lib/search";

export const Route = createFileRoute("/wd-issue-tl")({
  component: TlAllocationPage,
  validateSearch: (s: Record<string, unknown>) => ({
    wd: typeof s.wd === "string" ? s.wd : undefined,
  }),
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
  byMat: Map<string, { allocated: number; returned: number; used: number; pending: number }>;
};

type TlActivity = {
  lastActivityAt: string | null; // ISO
  lastIssueAt: string | null; // ISO of latest issuance
  issuedThisMonth: number; // sum of qty_issued in current calendar month
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
      const monthStartIso = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
      const [{ data: issRows }, retRes, reasonRes, monthIss] = await Promise.all([
        supabase
          .from("tl_issuances")
          .select("id, wd_tl_id, created_at")
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
        supabase
          .from("tl_issuances")
          .select("id, wd_tl_id, created_at")
          .in("wd_tl_id", tlIds)
          .gte("created_at", monthStartIso),
      ]);

      // Last activity = max(issuance, return) per TL
      const lastBy = new Map<string, string>();
      // Last issue specifically
      const lastIssueBy = new Map<string, string>();
      for (const r of (issRows ?? []) as { wd_tl_id: string; created_at: string }[]) {
        const cur = lastBy.get(r.wd_tl_id);
        if (!cur || r.created_at > cur) lastBy.set(r.wd_tl_id, r.created_at);
        const curI = lastIssueBy.get(r.wd_tl_id);
        if (!curI || r.created_at > curI) lastIssueBy.set(r.wd_tl_id, r.created_at);
      }
      for (const r of (retRes.data ?? []) as unknown as { wd_tl_id: string; created_at: string }[]) {
        const cur = lastBy.get(r.wd_tl_id);
        if (!cur || r.created_at > cur) lastBy.set(r.wd_tl_id, r.created_at);
      }

      // Monthly issued totals: sum qty_issued from items belonging to this month's issuances
      const monthIssIds = (monthIss.data ?? []).map((r) => r.id as string);
      const monthIssToTl = new Map(
        (monthIss.data ?? []).map((r) => [r.id as string, r.wd_tl_id as string]),
      );
      const monthlyBy = new Map<string, number>();
      if (monthIssIds.length > 0) {
        const { data: monthItems } = await supabase
          .from("tl_issuance_items")
          .select("issuance_id, qty_issued")
          .in("issuance_id", monthIssIds);
        for (const it of monthItems ?? []) {
          const tl = monthIssToTl.get(it.issuance_id as string);
          if (!tl) continue;
          monthlyBy.set(tl, (monthlyBy.get(tl) ?? 0) + (it.qty_issued ?? 0));
        }
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
        if (reasonBy.has(r.wd_tl_id)) continue;
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
          lastIssueAt: lastIssueBy.get(t.id) ?? null,
          issuedThisMonth: monthlyBy.get(t.id) ?? 0,
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

function useTlBalances(refreshKey: number, wdCode?: string | null) {
  const { tls } = useTlsForMyWd(wdCode);
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
          .select("issuance_id, material_code, qty_issued, qty_used")
          .in("issuance_id", issIds)
      : { data: [] as Array<{ issuance_id: string; material_code: string; qty_issued: number; qty_used: number }> };

    // Returns
    const { data: retRows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_returns" as any)
      .select("wd_tl_id, material_code, qty")
      .in("wd_tl_id", tlIds);

    // Usages (v2 flow — TL marks self-used)
    const { data: useRows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_usages" as any)
      .select("wd_tl_id, material_code, qty")
      .in("wd_tl_id", tlIds);

    const map = new Map<string, TlBalance>();
    for (const t of tls) map.set(t.id, { tlId: t.id, byMat: new Map() });

    for (const l of lineRows ?? []) {
      const tlId = issToTl.get(l.issuance_id as string);
      if (!tlId) continue;
      const bal = map.get(tlId)!;
      const cur = bal.byMat.get(l.material_code) ?? { allocated: 0, returned: 0, used: 0, pending: 0 };
      cur.allocated += l.qty_issued;
      // Legacy v1 usage is stored on the issuance line
      if (l.qty_used > 0) cur.used += l.qty_used;
      bal.byMat.set(l.material_code, cur);
    }
    for (const r of (retRows ?? []) as unknown as Array<{ wd_tl_id: string; material_code: string; qty: number }>) {
      const bal = map.get(r.wd_tl_id);
      if (!bal) continue;
      const cur = bal.byMat.get(r.material_code) ?? { allocated: 0, returned: 0, used: 0, pending: 0 };
      cur.returned += r.qty;
      bal.byMat.set(r.material_code, cur);
    }
    for (const u of (useRows ?? []) as unknown as Array<{ wd_tl_id: string; material_code: string; qty: number }>) {
      const bal = map.get(u.wd_tl_id);
      if (!bal) continue;
      const cur = bal.byMat.get(u.material_code) ?? { allocated: 0, returned: 0, used: 0, pending: 0 };
      cur.used += u.qty;
      bal.byMat.set(u.material_code, cur);
    }
    for (const bal of map.values()) {
      for (const [k, v] of bal.byMat) {
        v.pending = v.allocated - v.returned - v.used;
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
  const { wd: wdParam } = Route.useSearch();
  const activeWd = wdParam ?? null;
  const { tls, loading: tlsLoading } = useTlsForMyWd(activeWd);
  const [tab, setTab] = useState<Tab>("allocate");
  const [refreshKey, setRefreshKey] = useState(0);
  const { balances, loading: balLoading } = useTlBalances(refreshKey, activeWd);
  const { refresh: refreshWdStock } = useWdStock(activeWd);
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

  const totalPending = useMemo(() => {
    let n = 0;
    for (const b of balances.values()) {
      for (const v of b.byMat.values()) n += Math.max(v.pending, 0);
    }
    return n;
  }, [balances]);

  const bumpAll = async () => {
    setRefreshKey((k) => k + 1);
    await refreshWdStock();
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Hero header */}
        <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-accent/10 via-card to-primary/5 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/20">
              <ArrowLeftRight size={20} className="text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-lg font-bold leading-tight tracking-tight">TL Allocation</h2>
              <p className="text-[11px] text-muted-foreground">
                Send stock · Record returns · Track activity per TL
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="TLs linked" value={tls.length} tone="primary" loading={tlsLoading} />
            <Stat label="Stock with TLs" value={totalPending} tone="accent" loading={balLoading} />
            <Stat label="Inactive (7d+)" value={inactiveCount} tone={inactiveCount > 0 ? "warn" : "muted"} loading={tlsLoading} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
          {(
            [
              { k: "allocate", l: "Send Stock", i: <Send size={14} /> },
              { k: "return", l: "Return", i: <Undo2 size={14} /> },
              { k: "history", l: "History", i: <History size={14} /> },
            ] as { k: Tab; l: string; i: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                tab === t.k
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {t.i}
              {t.l}
            </button>
          ))}
        </div>

        {tab === "allocate" && (
          <AllocateTab
            tls={tls}
            tlsLoading={tlsLoading}
            balances={balances}
            activity={activity}
            onMarkReason={(t) => setReasonFor(t)}
            onDone={bumpAll}
            activeWd={activeWd}
            refreshKey={refreshKey}
          />
        )}
        {tab === "return" && (
          <ReturnTab tls={tls} balances={balances} activity={activity} onDone={bumpAll} />
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

function Stat({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone: "primary" | "accent" | "warn" | "muted";
  loading?: boolean;
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "accent"
        ? "text-accent"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  return (
    <div className="rounded-xl border bg-background/60 px-3 py-2 backdrop-blur">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-mono text-xl font-bold leading-none ${toneCls}`}>
        {loading ? "…" : value}
      </p>
    </div>
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

// ───────────────────────── helpers ─────────────────────────

function fmtRelativeDay(iso: string | null): string {
  if (!iso) return "Never";
  const d = daysSince(iso);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  const dt = new Date(iso);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
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
    if (reason === "other" && !comment.trim()) {
      toast.error("Please mention a reason");
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
            Comment {reason === "other" ? "(required)" : "(optional)"}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={reason === "other" ? "Please mention the reason…" : ""}
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

// ───────────────────────── shared section card ─────────────────────────

function SectionCard({
  step,
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm transition">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {badge}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t bg-background/50 p-3">{children}</div>}
    </div>
  );
}

// ───────────────────────── TL detail panel ─────────────────────────

function TlDetailPanel({
  tl,
  balance,
  act,
  onMarkReason,
}: {
  tl: TlOption;
  balance: TlBalance | undefined;
  act: TlActivity | undefined;
  onMarkReason: (tl: TlOption) => void;
}) {
  const items = useMemo(() => {
    if (!balance) return [];
    return Array.from(balance.byMat.entries())
      .map(([code, v]) => ({ code, ...v }))
      .filter((x) => x.allocated > 0 || x.returned > 0)
      .sort((a, b) => b.pending - a.pending || a.code.localeCompare(b.code));
  }, [balance]);
  const pendingTotal = items.reduce((s, x) => s + Math.max(x.pending, 0), 0);
  const inactive = act ? daysSince(act.lastActivityAt) >= INACTIVITY_DAYS : false;
  const marked = act ? reasonIsActive(act.reason) : false;

  return (
    <div className="mt-2 space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Stock with TL" value={pendingTotal} tone="accent" />
        <MiniStat label="Last issue" value={fmtRelativeDay(act?.lastIssueAt ?? null)} tone="primary" />
        <MiniStat label="Last activity" value={fmtRelativeDay(act?.lastActivityAt ?? null)} tone="muted" />
        <MiniStat label="Issued (month)" value={act?.issuedThisMonth ?? 0} tone="primary" />
      </div>

      {marked && act?.reason && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          {reasonLabel(act.reason)}
        </div>
      )}
      {inactive && !marked && (
        <button
          onClick={() => onMarkReason(tl)}
          className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
        >
          ⚠ Inactive {INACTIVITY_DAYS}d+ · Mark Reason
        </button>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
          Materials with this TL
        </p>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed bg-background p-2 text-center text-[11px] text-muted-foreground">
            No allocations recorded yet.
          </p>
        ) : (
          <div className="divide-y rounded-lg border bg-background">
            {items.slice(0, 8).map((it) => (
              <div key={it.code} className="grid grid-cols-4 gap-1 px-2 py-1.5 text-[11px]">
                <span className="font-mono font-bold">{it.code}</span>
                <span className="text-right text-muted-foreground">
                  Issued <span className="font-mono font-bold text-foreground">{it.allocated}</span>
                </span>
                <span className="text-right text-muted-foreground">
                  Ret <span className="font-mono font-bold text-foreground">{it.returned}</span>
                </span>
                <span className="text-right text-muted-foreground">
                  Pending{" "}
                  <span className={`font-mono font-bold ${it.pending > 0 ? "text-accent" : "text-foreground"}`}>
                    {it.pending}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "primary" | "accent" | "muted";
}) {
  const cls =
    tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="rounded-lg border bg-background px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate font-mono text-sm font-bold ${cls}`}>{value}</p>
    </div>
  );
}

// ───────────────────────── ALLOCATE TAB ─────────────────────────

type LineDraft = { code: string; qty: string };
type OpenSection = "tl" | "mat" | "qty";

function AllocateTab({
  tls,
  tlsLoading,
  balances,
  activity,
  onMarkReason,
  onDone,
  activeWd,
  refreshKey,
}: {
  tls: TlOption[];
  tlsLoading: boolean;
  balances: Map<string, TlBalance>;
  activity: Map<string, TlActivity>;
  onMarkReason: (tl: TlOption) => void;
  onDone: () => Promise<void> | void;
  activeWd: string | null;
  refreshKey: number;
}) {
  const [tlId, setTlId] = useState<string>("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openSection, setOpenSection] = useState<OpenSection | null>("tl");
  const [expandedMat, setExpandedMat] = useState<string | null>(null);
  const [tlSearch, setTlSearch] = useState("");
  const [matSearch, setMatSearch] = useState("");
  const { stock, loading: stockLoading, wdCode } = useWdStock(activeWd);
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

  // Aggregate per-material across all TLs (issued / returned / remaining)
  const matAgg = useMemo(() => {
    const map = new Map<
      string,
      { allocated: number; returned: number; pending: number; perTl: { tlId: string; allocated: number; returned: number; pending: number }[] }
    >();
    for (const [tid, bal] of balances) {
      for (const [code, v] of bal.byMat) {
        const cur =
          map.get(code) ?? { allocated: 0, returned: 0, pending: 0, perTl: [] };
        cur.allocated += v.allocated;
        cur.returned += v.returned;
        cur.pending += v.pending;
        cur.perTl.push({ tlId: tid, allocated: v.allocated, returned: v.returned, pending: v.pending });
        map.set(code, cur);
      }
    }
    return map;
  }, [balances]);

  // Recent allocation history (per material on demand) — derived from a single fetch
  const [recentByMat, setRecentByMat] = useState<Map<string, Array<{ id: string; tlId: string; date: string; qty: number }>>>(new Map());
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (tls.length === 0) {
        setRecentByMat(new Map());
        return;
      }
      const tlIds = tls.map((t) => t.id);
      const { data: issRows } = await supabase
        .from("tl_issuances")
        .select("id, wd_tl_id, issue_date, created_at")
        .in("wd_tl_id", tlIds)
        .order("created_at", { ascending: false })
        .limit(120);
      const issIds = (issRows ?? []).map((r) => r.id);
      const head = new Map(
        (issRows ?? []).map((r) => [r.id, { tlId: r.wd_tl_id as string, date: r.issue_date as string }]),
      );
      if (issIds.length === 0) {
        if (alive) setRecentByMat(new Map());
        return;
      }
      const { data: lines } = await supabase
        .from("tl_issuance_items")
        .select("id, issuance_id, material_code, qty_issued")
        .in("issuance_id", issIds);
      const out = new Map<string, Array<{ id: string; tlId: string; date: string; qty: number }>>();
      for (const l of lines ?? []) {
        const h = head.get(l.issuance_id as string);
        if (!h) continue;
        const arr = out.get(l.material_code) ?? [];
        arr.push({ id: l.id as string, tlId: h.tlId, date: h.date, qty: l.qty_issued as number });
        out.set(l.material_code, arr);
      }
      for (const [k, arr] of out) {
        arr.sort((a, b) => b.date.localeCompare(a.date));
        out.set(k, arr.slice(0, 6));
      }
      if (alive) setRecentByMat(out);
    })();
    return () => {
      alive = false;
    };
  }, [tls, refreshKey]);

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
    setOpenSection("qty");
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
    setOpenSection("tl");
    await onDone();
  }

  const selectedTl = tls.find((t) => t.id === tlId) ?? null;
  const tlMap = useMemo(() => new Map(tls.map((t) => [t.id, t])), [tls]);

  function toggle(s: OpenSection) {
    setOpenSection((cur) => (cur === s ? null : s));
  }

  return (
    <div className="space-y-3">
      {/* STEP 1: TL */}
      <SectionCard
        step={1}
        title="Choose Team Leader"
        subtitle={selectedTl ? selectedTl.tl_name : "Tap a TL to view their stock & activity"}
        open={openSection === "tl"}
        onToggle={() => toggle("tl")}
        badge={
          selectedTl ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              Selected
            </span>
          ) : null
        }
      >
        {tlsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Loading TLs…
          </div>
        ) : tls.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No TLs linked to this WD yet.
          </p>
        ) : (
          <>
            <div className="relative mb-2">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={tlSearch}
                onChange={(e) => setTlSearch(e.target.value)}
                placeholder="Search TL by name or ID…"
                className="w-full rounded-lg border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tls
                .filter((t) =>
                  matchesSearch(tlSearch, t.tl_name, t.legacy_tl_id, t.tl_type),
                )
                .map((t) => {
                const a = activity.get(t.id);
                const bal = balances.get(t.id);
                const pending = bal
                  ? Array.from(bal.byMat.values()).reduce((s, v) => s + Math.max(v.pending, 0), 0)
                  : 0;
                const inactive = a ? daysSince(a.lastActivityAt) >= INACTIVITY_DAYS : false;
                const marked = a ? reasonIsActive(a.reason) : false;
                const sel = tlId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTlId(sel ? "" : t.id)}
                    className={`group relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                      sel
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                        : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <Users size={11} className="shrink-0 text-muted-foreground" />
                      <TlLabel tl={t} nameClass="text-[12px] text-foreground" metaClass="text-muted-foreground" />
                    </div>
                    <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                      <span>Last: <span className="font-semibold text-foreground">{fmtRelativeDay(a?.lastActivityAt ?? null)}</span></span>
                      <span className="font-mono font-bold text-accent">{pending}</span>
                    </div>
                    {(inactive && !marked) && (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                        ⚠ Inactive
                      </span>
                    )}
                    {marked && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        Marked
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedTl && (
              <TlDetailPanel
                tl={selectedTl}
                balance={balances.get(selectedTl.id)}
                act={activity.get(selectedTl.id)}
                onMarkReason={onMarkReason}
              />
            )}
          </>
        )}
      </SectionCard>

      {/* STEP 2: Materials */}
      <SectionCard
        step={2}
        title="Select Materials"
        subtitle={
          lines.length > 0
            ? `${lines.length} material${lines.length === 1 ? "" : "s"} selected`
            : "Tap a material to add it · tap again for full breakdown"
        }
        open={openSection === "mat"}
        onToggle={() => toggle("mat")}
        badge={
          lines.length > 0 ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
              {lines.length}
            </span>
          ) : null
        }
      >
        {stockLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Loading stock…
          </div>
        ) : stocked.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No stock available to allocate.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={matSearch}
                onChange={(e) => setMatSearch(e.target.value)}
                placeholder="Search material code or name…"
                className="w-full rounded-lg border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {stocked
              .filter((s) =>
                matchesSearch(matSearch, s.material_code, matName.get(s.material_code) ?? ""),
              )
              .map((s) => {
              const sel = !!lines.find((l) => l.code === s.material_code);
              const exp = expandedMat === s.material_code;
              const agg = matAgg.get(s.material_code);
              const recent = recentByMat.get(s.material_code) ?? [];
              return (
                <div
                  key={s.material_code}
                  className={`overflow-hidden rounded-xl border transition ${
                    sel ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 p-2">
                    <button
                      onClick={() => setExpandedMat(exp ? null : s.material_code)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left hover:bg-muted/40"
                    >
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-muted-foreground transition-transform ${exp ? "rotate-180" : "-rotate-90"}`}
                      />
                      <div className="min-w-0">
                        <p className="font-mono text-[12px] font-bold">{s.material_code}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {matName.get(s.material_code) ?? "—"}
                        </p>
                      </div>
                    </button>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase text-muted-foreground">Avail</p>
                      <p className="font-mono text-sm font-bold text-primary">{s.available}</p>
                      {s.inTransit > 0 && (
                        <p className="text-[9px] text-muted-foreground">{s.inTransit} in transit</p>
                      )}
                    </div>
                    <button
                      onClick={() => (sel ? removeLine(s.material_code) : pickMaterial(s.material_code))}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                        sel
                          ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      {sel ? "Remove" : "Add"}
                    </button>
                  </div>

                  {exp && (
                    <div className="space-y-2.5 border-t bg-background/60 p-3">
                      <div className="grid grid-cols-4 gap-1.5">
                        <MiniStat label="On hand" value={s.qty} tone="primary" />
                        <MiniStat label="Issued" value={agg?.allocated ?? 0} tone="muted" />
                        <MiniStat label="Returned" value={agg?.returned ?? 0} tone="muted" />
                        <MiniStat label="Remaining" value={agg?.pending ?? 0} tone="accent" />
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                          TL-wise allocation
                        </p>
                        {!agg || agg.perTl.filter((p) => p.allocated > 0).length === 0 ? (
                          <p className="rounded-md border border-dashed bg-muted/20 p-2 text-center text-[11px] text-muted-foreground">
                            Never allocated.
                          </p>
                        ) : (
                          <div className="divide-y rounded-lg border bg-background">
                            {agg.perTl
                              .filter((p) => p.allocated > 0)
                              .sort((a, b) => b.pending - a.pending)
                              .slice(0, 6)
                              .map((p) => {
                                const t = tlMap.get(p.tlId);
                                return (
                                  <div key={p.tlId} className="grid grid-cols-4 gap-1 px-2 py-1.5 text-[11px]">
                                    <span className="col-span-1 truncate">
                                      {t ? <TlLabel tl={t} bold={false} /> : "—"}
                                    </span>
                                    <span className="text-right text-muted-foreground">
                                      <span className="font-mono font-bold text-foreground">{p.allocated}</span>
                                    </span>
                                    <span className="text-right text-muted-foreground">
                                      <span className="font-mono font-bold text-foreground">{p.returned}</span>
                                    </span>
                                    <span className="text-right">
                                      <span
                                        className={`font-mono font-bold ${p.pending > 0 ? "text-accent" : "text-foreground"}`}
                                      >
                                        {p.pending}
                                      </span>
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                          Recent allocations
                        </p>
                        {recent.length === 0 ? (
                          <p className="rounded-md border border-dashed bg-muted/20 p-2 text-center text-[11px] text-muted-foreground">
                            No recent activity.
                          </p>
                        ) : (
                          <div className="divide-y rounded-lg border bg-background">
                            {recent.map((r) => {
                              const t = tlMap.get(r.tlId);
                              return (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]"
                                >
                                  <span className="min-w-0 truncate">
                                    {t ? <TlLabel tl={t} bold={false} /> : "—"}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                    })}
                                  </span>
                                  <span className="shrink-0 font-mono font-bold text-primary">
                                    +{r.qty}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* STEP 3: Quantities + submit */}
      <SectionCard
        step={3}
        title="Allocation Details"
        subtitle={
          !selectedTl
            ? "Pick a TL first"
            : lines.length === 0
              ? "Pick at least one material"
              : `Sending to ${selectedTl.tl_name}`
        }
        open={openSection === "qty"}
        onToggle={() => toggle("qty")}
        badge={
          valid ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              Ready
            </span>
          ) : null
        }
      >
        {lines.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            Select materials in step 2 to set quantities.
          </p>
        ) : (
          <div className="space-y-2">
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
                    <p className="truncate text-[10px] text-muted-foreground">
                      {matName.get(l.code) ?? "—"}
                    </p>
                    <p className="text-[10px] font-bold text-primary">Avail: {avail}</p>
                    {transit > 0 && (
                      <p className="text-[9px] text-muted-foreground">{transit} in transit</p>
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
        )}

        <button
          onClick={submit}
          disabled={!valid || submitting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Stock to TL
        </button>
      </SectionCard>

      {/* Sticky operational action bar */}
      {(tlId || lines.length > 0) && (
        <div className="sticky bottom-16 z-20 mt-2 -mx-3 border-t border-border/60 bg-card/95 px-3 py-2 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur sm:bottom-0">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="min-w-0 flex-1 text-[11px]">
              <p className="truncate font-bold text-foreground">
                {selectedTl ? selectedTl.tl_name : "No TL selected"}
              </p>
              <p className="truncate text-muted-foreground">
                {lines.length === 0
                  ? "No materials added"
                  : `${lines.length} material${lines.length === 1 ? "" : "s"} ready`}
              </p>
            </div>
            {!valid && lines.length > 0 && (
              <button
                onClick={() => setOpenSection("qty")}
                className="rounded-lg border bg-background px-3 py-2 text-[11px] font-bold text-foreground hover:bg-muted"
              >
                Set Qty
              </button>
            )}
            <button
              onClick={submit}
              disabled={!valid || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-[0.97] disabled:opacity-40"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── RETURN TAB ─────────────────────────

function ReturnTab({
  tls,
  balances,
  activity,
  onDone,
}: {
  tls: TlOption[];
  balances: Map<string, TlBalance>;
  activity: Map<string, TlActivity>;
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

  const selectedTl = tls.find((t) => t.id === tlId) ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          1. Pick TL to return from
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tls.map((t) => {
            const bal = balances.get(t.id);
            const pending = bal
              ? Array.from(bal.byMat.values()).reduce((s, v) => s + Math.max(v.pending, 0), 0)
              : 0;
            const a = activity.get(t.id);
            const sel = tlId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTlId(sel ? "" : t.id)}
                disabled={pending === 0}
                className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition ${
                  sel
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                    : pending === 0
                      ? "border-muted bg-muted/30 text-muted-foreground"
                      : "border-border bg-background hover:border-primary/50"
                }`}
              >
                <div className="flex w-full items-center gap-1.5">
                  <Users size={11} className="shrink-0 text-muted-foreground" />
                  <TlLabel tl={t} nameClass="text-[12px]" />
                </div>
                <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                  <span>Last: {fmtRelativeDay(a?.lastIssueAt ?? null)}</span>
                  <span className="font-mono font-bold text-accent">{pending}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedTl && (
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            2. Returned quantities — {selectedTl.tl_name}
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
                        Pending to return: <span className="font-bold text-accent">{m.pending}</span>
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

          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
            Record Return
          </button>
        </div>
      )}
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
  const [filterKind, setFilterKind] = useState<"all" | "alloc" | "return">("all");

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

  const filtered = filterKind === "all" ? entries : entries.filter((e) => e.kind === filterKind);

  if (loading) {
    return (
      <div className="flex justify-center py-6 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border bg-card p-1">
        {(["all", "alloc", "return"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilterKind(k)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              filterKind === k
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {k === "all" ? "All" : k === "alloc" ? "Sent" : "Returned"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-4 text-center text-xs text-muted-foreground">
          No history yet.
        </div>
      ) : (
        <div className="divide-y rounded-2xl border bg-card">
          {filtered.map((e) => (
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
                  {tlMap.get(e.tlId) ? <TlLabel tl={tlMap.get(e.tlId)!} /> : "—"} ·{" "}
                  <span className="font-mono">{e.material_code}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(e.date + "T00:00:00").toLocaleDateString("en-IN")}
                </p>
              </div>
              <p className="font-mono text-sm font-bold">{e.qty}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
