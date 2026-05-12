import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  AlertTriangle,
  History,
  Search,
  ChevronDown,
  CheckCircle2,
  Package,
  Warehouse,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/tl")({
  component: TlPortalPage,
  head: () => ({
    meta: [
      { title: "TL Portal — POSM Tracker" },
      { name: "description", content: "Manage your TL stock — receive, mark used, return." },
    ],
  }),
});

type TlProfile = {
  id: string;
  tl_name: string;
  legacy_tl_id: number | null;
  tl_type: string | null;
  wd_code: string;
  wd_name: string | null;
};

type Material = { code: string; name: string };

type ActivityRow = {
  kind: "received" | "used" | "returned";
  date: string;
  material_code: string;
  qty: number;
};

type MatStat = {
  code: string;
  name: string;
  received: number;
  used: number;
  returned: number;
  balance: number;
  lastReceived: string | null;
  lastUsed: string | null;
  lastReturned: string | null;
};

function tlMeta(t: TlProfile) {
  return [t.legacy_tl_id, t.tl_type].filter(Boolean).join(" - ");
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function TlPortalPage() {
  const { user, profile } = useAuth();
  const [tl, setTl] = useState<TlProfile | null>(null);
  const [tlLoadErr, setTlLoadErr] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [wdStock, setWdStock] = useState<Record<string, number>>({});
  const [matStats, setMatStats] = useState<Record<string, MatStat>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTl, setSearchTl] = useState("");
  const [searchWd, setSearchWd] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | "all" | null>(null);

  // Inline qty state per row
  const [takeQty, setTakeQty] = useState<Record<string, string>>({});
  const [actionMat, setActionMat] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"used" | "return" | null>(null);
  const [actionQty, setActionQty] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const matName = useMemo(() => {
    const m = new Map<string, string>();
    materials.forEach((x) => m.set(x.code, x.name));
    return m;
  }, [materials]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setTlLoadErr(null);

    const { data: tlRow, error: tlErr } = await supabase
      .from("wd_tls")
      .select("id, tl_name, legacy_tl_id, tl_type, wd_code, wd_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tlErr) {
      setTlLoadErr(tlErr.message);
      setLoading(false);
      return;
    }
    if (!tlRow) {
      setTl(null);
      setLoading(false);
      return;
    }
    const tlInfo = tlRow as TlProfile;

    if (!tlInfo.wd_name) {
      const { data: wdRow } = await supabase
        .from("hierarchy_wd")
        .select("wd_name")
        .eq("wd_code", tlInfo.wd_code)
        .maybeSingle();
      tlInfo.wd_name = wdRow?.wd_name ?? null;
    }
    setTl(tlInfo);

    const [matsRes, stockRes, issRes, retRes, useRes] = await Promise.all([
      supabase.from("materials").select("code, name").order("code"),
      supabase.from("wd_stock").select("material_code, qty").eq("wd_code", tlInfo.wd_code),
      supabase
        .from("tl_issuances")
        .select("id, created_at")
        .eq("wd_tl_id", tlInfo.id)
        .order("created_at", { ascending: false }),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("tl_returns" as any)
        .select("material_code, qty, created_at")
        .eq("wd_tl_id", tlInfo.id)
        .order("created_at", { ascending: false }),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("tl_usages" as any)
        .select("material_code, qty, created_at")
        .eq("wd_tl_id", tlInfo.id)
        .order("created_at", { ascending: false }),
    ]);

    setMaterials((matsRes.data ?? []) as Material[]);
    const s: Record<string, number> = {};
    for (const r of (stockRes.data ?? []) as { material_code: string; qty: number }[]) {
      s[r.material_code] = r.qty;
    }
    setWdStock(s);

    const issuances = (issRes.data ?? []) as { id: string; created_at: string }[];
    const issIds = issuances.map((i) => i.id);
    const itemsRes = issIds.length
      ? await supabase
          .from("tl_issuance_items")
          .select("issuance_id, material_code, qty_issued")
          .in("issuance_id", issIds)
      : { data: [] as { issuance_id: string; material_code: string; qty_issued: number }[] };
    const issItems = (itemsRes.data ?? []) as {
      issuance_id: string;
      material_code: string;
      qty_issued: number;
    }[];
    const issCreated = new Map(issuances.map((i) => [i.id, i.created_at]));
    const returns = (retRes.data ?? []) as unknown as {
      material_code: string;
      qty: number;
      created_at: string;
    }[];
    const usages = (useRes.data ?? []) as unknown as {
      material_code: string;
      qty: number;
      created_at: string;
    }[];

    const stats: Record<string, MatStat> = {};
    const ensure = (code: string) => {
      if (!stats[code]) {
        stats[code] = {
          code,
          name: "",
          received: 0,
          used: 0,
          returned: 0,
          balance: 0,
          lastReceived: null,
          lastUsed: null,
          lastReturned: null,
        };
      }
      return stats[code];
    };
    for (const it of issItems) {
      const r = ensure(it.material_code);
      r.received += it.qty_issued;
      const d = issCreated.get(it.issuance_id) ?? null;
      if (d && (!r.lastReceived || d > r.lastReceived)) r.lastReceived = d;
    }
    for (const r of returns) {
      const x = ensure(r.material_code);
      x.returned += r.qty;
      if (!x.lastReturned || r.created_at > x.lastReturned) x.lastReturned = r.created_at;
    }
    for (const u of usages) {
      const x = ensure(u.material_code);
      x.used += u.qty;
      if (!x.lastUsed || u.created_at > x.lastUsed) x.lastUsed = u.created_at;
    }
    Object.values(stats).forEach((x) => {
      x.balance = x.received - x.returned - x.used;
      x.name = (matsRes.data ?? []).find((m) => m.code === x.code)?.name ?? x.code;
    });
    setMatStats(stats);

    const acts: ActivityRow[] = [];
    for (const it of issItems) {
      acts.push({
        kind: "received",
        date: issCreated.get(it.issuance_id) ?? "",
        material_code: it.material_code,
        qty: it.qty_issued,
      });
    }
    for (const r of returns) {
      acts.push({ kind: "returned", date: r.created_at, material_code: r.material_code, qty: r.qty });
    }
    for (const u of usages) {
      acts.push({ kind: "used", date: u.created_at, material_code: u.material_code, qty: u.qty });
    }
    acts.sort((a, b) => (a.date < b.date ? 1 : -1));
    setActivity(acts);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tl?.wd_code) return;
    const channel = supabase
      .channel(`wd_stock:${tl.wd_code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wd_stock", filter: `wd_code=eq.${tl.wd_code}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tl?.wd_code, refresh]);

  async function submitTake(code: string) {
    const qty = Number(takeQty[code]);
    const max = wdStock[code] ?? 0;
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a quantity");
    if (qty > max) return toast.error(`WD has only ${max}`);
    setSubmitting(`take-${code}`);
    const { error } = await supabase.rpc("tl_self_take", { _material_code: code, _qty: qty });
    setSubmitting(null);
    if (error) return toast.error(error.message);
    toast.success(`Received ${qty} × ${matName.get(code) ?? code}`);
    setTakeQty((p) => ({ ...p, [code]: "" }));
    void refresh();
  }

  function openAction(code: string, kind: "used" | "return") {
    setActionMat(code);
    setActionKind(kind);
    setActionQty("");
  }
  function closeAction() {
    setActionMat(null);
    setActionKind(null);
    setActionQty("");
  }

  async function submitAction() {
    if (!actionMat || !actionKind) return;
    const qty = Number(actionQty);
    const max = matStats[actionMat]?.balance ?? 0;
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a quantity");
    if (qty > max) return toast.error(`Max allowed: ${max}`);
    setSubmitting("action");
    let error;
    if (actionKind === "used") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase.rpc as any)("tl_self_used", { _material_code: actionMat, _qty: qty }));
    } else {
      ({ error } = await supabase.rpc("tl_self_return", { _material_code: actionMat, _qty: qty }));
    }
    setSubmitting(null);
    if (error) return toast.error(error.message);
    toast.success(`${actionKind === "used" ? "Marked used" : "Returned"} ${qty} × ${matName.get(actionMat) ?? actionMat}`);
    closeAction();
    void refresh();
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </AppShell>
    );
  }

  if (tlLoadErr) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          <AlertTriangle className="mb-2" size={20} />
          Could not load your TL profile: {tlLoadErr}
        </div>
      </AppShell>
    );
  }

  if (!tl) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-5 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Not linked to a TL profile
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {profile?.display_name ?? "You"} has the TL role but isn't linked to a Team
                Leader record yet. Ask your admin to link your account on the User Management
                page.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const materialsHeld = Object.values(matStats).filter((m) => m.balance > 0).length;
  const pendingReturns = Object.values(matStats).reduce((a, b) => a + Math.max(0, b.balance), 0);
  const lastActivityDate = activity[0]?.date ?? null;

  const wdList = materials
    .map((m) => ({ ...m, qty: wdStock[m.code] ?? 0 }))
    .filter((m) => m.qty > 0)
    .filter((m) =>
      !searchWd ||
      m.code.toLowerCase().includes(searchWd.toLowerCase()) ||
      m.name.toLowerCase().includes(searchWd.toLowerCase()),
    )
    .sort((a, b) => a.code.localeCompare(b.code));

  const tlList = Object.values(matStats)
    .filter((m) => m.received > 0)
    .filter((m) =>
      !searchTl ||
      m.code.toLowerCase().includes(searchTl.toLowerCase()) ||
      m.name.toLowerCase().includes(searchTl.toLowerCase()),
    )
    .sort((a, b) => b.balance - a.balance || a.code.localeCompare(b.code));

  const lastDate = lastActivityDate ? new Date(lastActivityDate) : null;
  const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
  const inactive = daysSince === null || daysSince >= 7;

  const historyFiltered = historyOpen && historyOpen !== "all"
    ? activity.filter((a) => a.material_code === historyOpen)
    : activity;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {inactive && (
          <div className="rounded-xl border border-amber-500/60 bg-amber-50 p-3 dark:bg-amber-950/30">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} />
              <div className="text-xs text-amber-900 dark:text-amber-100">
                <strong>
                  {daysSince === null ? "No activity yet." : `No activity for ${daysSince} days.`}
                </strong>{" "}
                Please update your stock or contact your AE.
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-xl font-bold leading-tight text-foreground">
                {tl.tl_name}
                {tlMeta(tl) && (
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    ({tlMeta(tl)})
                  </span>
                )}
              </h1>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Warehouse size={12} />
                <span>
                  WD: <strong className="text-primary">{tl.wd_code}</strong>
                  {tl.wd_name && <> — <span className="text-foreground">{tl.wd_name}</span></>}
                </span>
              </div>
            </div>
            <button
              onClick={() => void refresh()}
              className="rounded-md border bg-card p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              Materials Held: <strong className="text-foreground">{materialsHeld}</strong>
            </span>
            <span className="text-muted-foreground">
              Pending Returns: <strong className="text-foreground">{pendingReturns}</strong>
            </span>
            <span className="text-muted-foreground">
              Last Activity: <strong className="text-foreground">{fmtDate(lastActivityDate)}</strong>
            </span>
          </div>
        </div>

        {/* TL-SOH Section */}
        <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                <Package size={16} className="text-primary" /> Your Stock
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Stock currently with you. Tap a material for actions.
              </p>
            </div>
            <button
              onClick={() => setHistoryOpen("all")}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
            >
              <History size={12} /> View History
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTl}
              onChange={(e) => setSearchTl(e.target.value)}
              placeholder="Search material…"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {tlList.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              You haven't received any materials yet. Use the WD section below to take stock.
            </p>
          ) : (
            <div className="divide-y rounded-xl border bg-background">
              {tlList.map((m) => {
                const open = expanded === `tl-${m.code}`;
                const wdAvail = wdStock[m.code] ?? 0;
                return (
                  <div key={m.code}>
                    <button
                      onClick={() => { setExpanded(open ? null : `tl-${m.code}`); closeAction(); }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">
                            {m.code}
                          </span>
                          <span className="truncate text-sm font-bold text-foreground">
                            {m.name}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Stock With You: <strong className={m.balance > 0 ? "text-primary" : "text-foreground"}>{m.balance}</strong>
                        </div>
                      </div>
                      <ChevronDown
                        size={14}
                        className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <div className="space-y-2.5 border-t bg-muted/20 p-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span>WD Available: <strong className="text-foreground">{wdAvail}</strong></span>
                          <span>Stock With You: <strong className="text-foreground">{m.balance}</strong></span>
                          <span>Last Received: <strong className="text-foreground">{fmtDate(m.lastReceived)}</strong></span>
                          <span>Last Used: <strong className="text-foreground">{fmtDate(m.lastUsed)}</strong></span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionBtn
                            icon={CheckCircle2}
                            label="Mark Used"
                            disabled={m.balance <= 0}
                            onClick={() => openAction(m.code, "used")}
                            variant="success"
                          />
                          <ActionBtn
                            icon={ArrowUpFromLine}
                            label="Return Unused"
                            disabled={m.balance <= 0}
                            onClick={() => openAction(m.code, "return")}
                            variant="muted"
                          />
                          <button
                            onClick={() => setHistoryOpen(m.code)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                          >
                            <History size={12} /> View History
                          </button>
                        </div>
                        {actionMat === m.code && actionKind && (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
                            <span className="text-[11px] text-muted-foreground">
                              Max: <strong className="text-foreground">{m.balance}</strong>
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={m.balance}
                              value={actionQty}
                              onChange={(e) => setActionQty(e.target.value)}
                              placeholder="Quantity"
                              autoFocus
                              className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                            />
                            <button
                              onClick={submitAction}
                              disabled={submitting === "action" || !actionQty}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              {submitting === "action" && <Loader2 className="animate-spin" size={12} />}
                              {actionKind === "used" ? "Confirm Used" : "Confirm Return"}
                            </button>
                            <button
                              onClick={closeAction}
                              className="rounded-md border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* WD-SOH Section */}
        <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <Warehouse size={16} className="text-primary" /> Receive from WD ({tl.wd_code})
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Available stock at your WD. Enter quantity and take.
            </p>
          </div>

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchWd}
              onChange={(e) => setSearchWd(e.target.value)}
              placeholder="Search material…"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {wdList.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              Nothing available at your WD right now.
            </p>
          ) : (
            <div className="divide-y rounded-xl border bg-background">
              {wdList.map((m) => {
                const isSubmitting = submitting === `take-${m.code}`;
                return (
                  <div
                    key={m.code}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">
                          {m.code}
                        </span>
                        <span className="truncate text-sm font-bold text-foreground">
                          {m.name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        WD Available: <strong className="text-primary">{m.qty}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={m.qty}
                        value={takeQty[m.code] ?? ""}
                        onChange={(e) => setTakeQty((p) => ({ ...p, [m.code]: e.target.value }))}
                        placeholder="Qty"
                        className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                      />
                      <button
                        onClick={() => submitTake(m.code)}
                        disabled={isSubmitting || !takeQty[m.code]}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="animate-spin" size={12} /> : <ArrowDownToLine size={12} />}
                        Take from WD
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Note:</strong> "Mark Used" permanently reduces your stock and cannot be returned later.
        </p>
      </div>

      {/* History modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setHistoryOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-2xl border bg-card shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <History size={14} className="text-primary" /> Stock History
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {historyOpen === "all"
                    ? "All recent activity"
                    : matName.get(historyOpen) ?? historyOpen}
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {historyFiltered.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="divide-y">
                  {historyFiltered.slice(0, 100).map((a, i) => {
                    const meta =
                      a.kind === "received"
                        ? { label: "Received from WD", color: "text-primary", bg: "bg-primary/10", sign: "+", Icon: ArrowDownToLine }
                        : a.kind === "used"
                          ? { label: "Marked used", color: "text-success", bg: "bg-success/10", sign: "−", Icon: CheckCircle2 }
                          : { label: "Returned to WD", color: "text-muted-foreground", bg: "bg-muted", sign: "−", Icon: ArrowUpFromLine };
                    const Icon = meta.Icon;
                    return (
                      <li key={i} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}>
                            <Icon size={13} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-foreground">
                              {matName.get(a.material_code) ?? a.material_code}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {meta.label} · {a.date ? new Date(a.date).toLocaleString() : ""}
                            </div>
                          </div>
                        </div>
                        <span className={`text-sm font-bold ${meta.color}`}>
                          {meta.sign}{a.qty}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = "primary",
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "success" | "muted";
}) {
  const cls =
    variant === "success"
      ? "bg-success text-success-foreground hover:bg-success/90"
      : variant === "muted"
        ? "border bg-card text-foreground hover:bg-muted"
        : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${cls}`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
