import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Loader2,
  RefreshCw,
  AlertTriangle,
  History,
  Search,
  ChevronDown,
  CheckCircle2,
  Package,
  Warehouse,
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
  return new Date(d).toLocaleDateString();
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
  const [tab, setTab] = useState<"wd" | "tl" | "history">("tl");

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionMat, setActionMat] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"take" | "used" | "return" | null>(null);
  const [actionQty, setActionQty] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    // Fallback WD name from hierarchy_wd if missing
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

  function openAction(code: string, kind: "take" | "used" | "return") {
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
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a quantity");

    let max = 0;
    if (actionKind === "take") max = wdStock[actionMat] ?? 0;
    else max = matStats[actionMat]?.balance ?? 0;
    if (qty > max) return toast.error(`Max allowed: ${max}`);

    setSubmitting(true);
    let error;
    if (actionKind === "take") {
      ({ error } = await supabase.rpc("tl_self_take", {
        _material_code: actionMat,
        _qty: qty,
      }));
    } else if (actionKind === "used") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase.rpc as any)("tl_self_used", {
        _material_code: actionMat,
        _qty: qty,
      }));
    } else {
      ({ error } = await supabase.rpc("tl_self_return", {
        _material_code: actionMat,
        _qty: qty,
      }));
    }
    setSubmitting(false);
    if (error) return toast.error(error.message);
    const verb =
      actionKind === "take" ? "Received" : actionKind === "used" ? "Marked used" : "Returned";
    toast.success(`${verb} ${qty} × ${matName.get(actionMat) ?? actionMat}`);
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

  const pendingCount = Object.values(matStats).reduce((a, b) => a + Math.max(0, b.balance), 0);
  const lastActivityDate = activity[0]?.date ?? null;

  // WD-SOH list (all materials with qty > 0 at WD)
  const wdList = materials
    .map((m) => ({ ...m, qty: wdStock[m.code] ?? 0 }))
    .filter((m) => m.qty > 0)
    .filter((m) =>
      !search ||
      m.code.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.code.localeCompare(b.code));

  // TL-SOH list — anything ever received
  const tlList = Object.values(matStats)
    .filter((m) => m.received > 0)
    .filter((m) =>
      !search ||
      m.code.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.balance - a.balance || a.code.localeCompare(b.code));

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Inactivity banner */}
        {(() => {
          const lastDate = lastActivityDate ? new Date(lastActivityDate) : null;
          const daysSince = lastDate
            ? Math.floor((Date.now() - lastDate.getTime()) / 86400000)
            : null;
          const inactive = daysSince === null || daysSince >= 7;
          if (!inactive) return null;
          return (
            <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-50 p-3 dark:bg-amber-950/30">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={20} />
                <div className="min-w-0 text-xs text-amber-900 dark:text-amber-100">
                  <strong>
                    {daysSince === null
                      ? "No activity yet."
                      : `No activity for ${daysSince} days.`}
                  </strong>{" "}
                  Please update your stock activity or contact your AE.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Header */}
        <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-4 shadow-sm">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refresh()}
                className="rounded-md border bg-card p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Current Balance
              </div>
              <div className="mt-0.5 text-lg font-bold text-primary">{pendingCount}</div>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Materials Held
              </div>
              <div className="mt-0.5 text-lg font-bold text-foreground">
                {Object.values(matStats).filter((m) => m.balance > 0).length}
              </div>
            </div>
            <div className="col-span-2 rounded-lg border bg-card p-2.5 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Last Activity
              </div>
              <div className="mt-0.5 text-sm font-bold text-foreground">
                {lastActivityDate ? new Date(lastActivityDate).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {([
            { k: "tl", label: "TL-SOH", icon: Package },
            { k: "wd", label: "WD-SOH", icon: Warehouse },
            { k: "history", label: "Stock History", icon: History },
          ] as const).map(({ k, label, icon: Icon }) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => { setTab(k); setExpanded(null); }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  active ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {/* Search (for TL/WD tabs) */}
        {tab !== "history" && (
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material by code or name…"
              className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* TL-SOH */}
        {tab === "tl" && (
          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <Package size={16} className="text-primary" /> TL-SOH (Your Stock on Hand)
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Received − Used − Returned. Tap a row to view details and actions.
                </p>
              </div>
            </div>

            {tlList.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                You haven't received any materials yet. Check WD-SOH to take stock.
              </p>
            ) : (
              <div className="divide-y rounded-xl border bg-background">
                {tlList.map((m) => {
                  const open = expanded === m.code;
                  return (
                    <div key={m.code}>
                      <button
                        onClick={() => setExpanded(open ? null : m.code)}
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
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>Recv <strong className="text-foreground">{m.received}</strong></span>
                            <span>Used <strong className="text-foreground">{m.used}</strong></span>
                            <span>Ret <strong className="text-foreground">{m.returned}</strong></span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                            m.balance > 0
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            Bal {m.balance}
                          </span>
                          <ChevronDown
                            size={14}
                            className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>
                      {open && (
                        <div className="space-y-3 border-t bg-muted/20 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Stat label="WD-SOH" value={wdStock[m.code] ?? 0} />
                            <Stat label="TL-SOH" value={m.balance} accent />
                            <Stat label="Last received" value={fmtDate(m.lastReceived)} small />
                            <Stat label="Last used" value={fmtDate(m.lastUsed)} small />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <ActionBtn
                              icon={ArrowDownToLine}
                              label="Take from WD"
                              disabled={(wdStock[m.code] ?? 0) <= 0}
                              onClick={() => openAction(m.code, "take")}
                            />
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
                          </div>
                          {actionMat === m.code && actionKind && (
                            <ActionInline
                              kind={actionKind}
                              qty={actionQty}
                              setQty={setActionQty}
                              max={
                                actionKind === "take"
                                  ? wdStock[m.code] ?? 0
                                  : m.balance
                              }
                              submitting={submitting}
                              onCancel={closeAction}
                              onSubmit={submitAction}
                            />
                          )}
                          <div className="text-[10px] text-muted-foreground">
                            Last returned: {fmtDate(m.lastReturned)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* WD-SOH */}
        {tab === "wd" && (
          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                <Warehouse size={16} className="text-primary" /> WD-SOH ({tl.wd_code})
              </h2>
              <p className="text-[11px] text-muted-foreground">Take material from WD stock.</p>
            </div>
            {wdList.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                Nothing available at your WD right now.
              </p>
            ) : (
              <div className="divide-y rounded-xl border bg-background">
                {wdList.map((m) => {
                  const open = expanded === `wd-${m.code}`;
                  const stat = matStats[m.code];
                  return (
                    <div key={m.code}>
                      <button
                        onClick={() => setExpanded(open ? null : `wd-${m.code}`)}
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
                          <div className="text-[10px] text-muted-foreground">
                            With you: <strong className="text-foreground">{stat?.balance ?? 0}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                            WD {m.qty}
                          </span>
                          <ChevronDown size={14} className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {open && (
                        <div className="space-y-3 border-t bg-muted/20 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Stat label="WD-SOH" value={m.qty} accent />
                            <Stat label="TL-SOH" value={stat?.balance ?? 0} />
                            <Stat label="Last received" value={fmtDate(stat?.lastReceived ?? null)} small />
                            <Stat label="Last used" value={fmtDate(stat?.lastUsed ?? null)} small />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <ActionBtn
                              icon={ArrowDownToLine}
                              label="Take from WD"
                              onClick={() => openAction(m.code, "take")}
                            />
                          </div>
                          {actionMat === m.code && actionKind === "take" && (
                            <ActionInline
                              kind="take"
                              qty={actionQty}
                              setQty={setActionQty}
                              max={m.qty}
                              submitting={submitting}
                              onCancel={closeAction}
                              onSubmit={submitAction}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* History */}
        {tab === "history" && (
          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <History size={16} className="text-primary" /> Stock History
            </h2>
            {activity.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-background">
                {activity.slice(0, 50).map((a, i) => {
                  const meta =
                    a.kind === "received"
                      ? { label: "Received from WD", color: "text-primary", bg: "bg-primary/10", sign: "+", Icon: ArrowDownToLine }
                      : a.kind === "used"
                        ? { label: "Marked used", color: "text-success", bg: "bg-success/10", sign: "−", Icon: CheckCircle2 }
                        : { label: "Returned to WD", color: "text-muted-foreground", bg: "bg-muted", sign: "−", Icon: ArrowUpFromLine };
                  const Icon = meta.Icon;
                  return (
                    <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
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
          </section>
        )}

        <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <Boxes size={12} className="mr-1 inline" />
          <strong className="text-foreground">Tip:</strong> Used stock permanently reduces your
          balance and cannot be returned later. Use <em>Return Unused</em> for material you no
          longer need.
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${small ? "text-xs" : "text-base"} font-bold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
    </div>
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

function ActionInline({
  kind,
  qty,
  setQty,
  max,
  submitting,
  onCancel,
  onSubmit,
}: {
  kind: "take" | "used" | "return";
  qty: string;
  setQty: (v: string) => void;
  max: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const label =
    kind === "take" ? "Confirm Take" : kind === "used" ? "Confirm Used" : "Confirm Return";
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="mb-2 text-[11px] text-muted-foreground">
        Max allowed: <strong className="text-foreground">{max}</strong>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={max}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Quantity"
          autoFocus
          className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
        />
        <button
          onClick={onSubmit}
          disabled={submitting || !qty}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="animate-spin" size={12} />}
          {label}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
