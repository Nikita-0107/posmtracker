import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Eye,
  Search,
  CheckCircle2,
  Package,
  Warehouse,
  X,
  CalendarClock,
  Inbox,
  ChevronRight,
  PackagePlus,
  ClipboardList,
  ChevronLeft,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { matchesSearch } from "@/lib/search";
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

type Screen = "home" | "receive" | "stock" | "activity" | "wdstock";

function tlMeta(t: TlProfile) {
  return [t.legacy_tl_id, t.tl_type].filter(Boolean).join(" · ");
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function TlPortalPage() {
  const { user, profile } = useAuth();
  const { isTlWdReceiver, tlReceiverWd } = useRoles();
  const [tl, setTl] = useState<TlProfile | null>(null);
  const [tlLoadErr, setTlLoadErr] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [wdStock, setWdStock] = useState<Record<string, number>>({});
  const [matStats, setMatStats] = useState<Record<string, MatStat>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [screen, setScreen] = useState<Screen>("home");
  const [activeReason, setActiveReason] = useState<{
    reason: string;
    leave_until: string | null;
    expires_at: string | null;
    comment: string | null;
    created_at: string;
  } | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);

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

    const { data: reasonRows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_inactivity_reasons" as any)
      .select("reason, leave_until, expires_at, comment, created_at")
      .eq("wd_tl_id", tlInfo.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const r = ((reasonRows ?? [])[0] ?? undefined) as unknown as
      | { reason: string; leave_until: string | null; expires_at: string | null; comment: string | null; created_at: string }
      | undefined;
    const now = Date.now();
    const stillActive = r
      ? r.leave_until
        ? new Date(r.leave_until + "T23:59:59").getTime() >= now
        : r.expires_at
          ? new Date(r.expires_at).getTime() >= now
          : false
      : false;
    setActiveReason(stillActive && r ? r : null);

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
  const wdAvailableCount = materials.filter((m) => (wdStock[m.code] ?? 0) > 0).length;

  const lastDate = lastActivityDate ? new Date(lastActivityDate) : null;
  const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
  const inactive = daysSince === null || daysSince >= 7;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        {/* Compact TL header */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-lg font-bold leading-tight text-foreground">
                {tl.tl_name}
              </h1>
              {tlMeta(tl) && (
                <p className="mt-0.5 text-xs text-muted-foreground">{tlMeta(tl)}</p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Warehouse size={12} />
                <span className="truncate">
                  <strong className="text-primary">{tl.wd_code}</strong>
                  {tl.wd_name && <> · {tl.wd_name}</>}
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
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Total Qty" value={pendingReturns} />
            <Stat label="SKU types" value={materialsHeld} />
            <Stat label="Last Activity" value={fmtDate(lastActivityDate)} />
          </div>
        </div>

        {/* WD Receiver banner */}
        {isTlWdReceiver && tlReceiverWd && (
          <Link
            to="/wd"
            search={{ wd: tlReceiverWd }}
            className="flex items-center gap-3 rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-500/10 to-card p-3 shadow-sm transition active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              <Inbox size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-foreground">Receive materials from WSP</p>
              <p className="text-[11px] text-muted-foreground">
                Delegated WD Receiver for <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{tlReceiverWd}</span>
              </p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground/60" />
          </Link>
        )}

        {/* Reason / inactivity banner */}
        {activeReason ? (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" size={18} />
              <div className="min-w-0 flex-1 text-xs text-emerald-900 dark:text-emerald-100">
                <strong>Reason: {reasonLabel(activeReason.reason)}</strong>
                {activeReason.leave_until && (
                  <> · until {new Date(activeReason.leave_until + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</>
                )}
                {activeReason.comment && (
                  <p className="mt-1 text-[11px] opacity-80">"{activeReason.comment}"</p>
                )}
              </div>
              <button
                onClick={() => setReasonModalOpen(true)}
                className="shrink-0 rounded-md border border-emerald-600/40 bg-background px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300"
              >
                Update
              </button>
            </div>
          </div>
        ) : inactive ? (
          <div className="rounded-xl border border-amber-500/60 bg-amber-50 p-3 dark:bg-amber-950/30">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} />
              <div className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-100">
                <strong>
                  {daysSince === null ? "No activity yet." : `No activity for ${daysSince} days.`}
                </strong>{" "}
                Update stock or mark a reason.
              </div>
              <button
                onClick={() => setReasonModalOpen(true)}
                className="shrink-0 rounded-md border border-amber-600/40 bg-background px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:text-amber-300"
              >
                Mark Reason
              </button>
            </div>
          </div>
        ) : null}

        {/* Primary action cards */}
        <div className="space-y-2.5">
          <ActionRow
            icon={PackagePlus}
            iconBg="bg-primary/15 text-primary"
            title="Collect Items from WD SOH"
            subtitle={
              wdAvailableCount === 0
                ? "Nothing available right now"
                : `${wdAvailableCount} material${wdAvailableCount === 1 ? "" : "s"} available at ${tl.wd_code}`
            }
            onClick={() => setScreen("receive")}
          />
          <ActionRow
            icon={Warehouse}
            iconBg="bg-sky-500/15 text-sky-600 dark:text-sky-400"
            title="WD Stock (Available at WD)"
            subtitle={
              wdAvailableCount === 0
                ? "No stock at WD right now"
                : `${wdAvailableCount} material${wdAvailableCount === 1 ? "" : "s"} in stock at ${tl.wd_code}`
            }
            onClick={() => setScreen("wdstock")}
          />
          <ActionRow
            icon={Package}
            iconBg="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            title="My SOH"
            subtitle={
              materialsHeld === 0
                ? "No stock with you"
                : `${materialsHeld} material${materialsHeld === 1 ? "" : "s"} · ${pendingReturns} units`
            }
            onClick={() => setScreen("stock")}
          />
          <ActionRow
            icon={ClipboardList}
            iconBg="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            title="Activity"
            subtitle={
              activity.length === 0
                ? "No activity yet"
                : `${activity.length} event${activity.length === 1 ? "" : "s"} · last ${fmtDate(lastActivityDate)}`
            }
            onClick={() => setScreen("activity")}
          />
        </div>

        <p className="px-1 text-[11px] text-muted-foreground">
          Tip: "Mark Used" permanently reduces your stock and cannot be returned later.
        </p>
      </div>

      {/* Focused screens */}
      {screen === "receive" && (
        <ReceiveSheet
          tl={tl}
          materials={materials}
          wdStock={wdStock}
          matName={matName}
          onClose={() => setScreen("home")}
          onDone={() => void refresh()}
        />
      )}
      {screen === "wdstock" && (
        <WdStockSheet
          tl={tl}
          materials={materials}
          wdStock={wdStock}
          onClose={() => setScreen("home")}
          onCollect={() => setScreen("receive")}
        />
      )}
      {screen === "stock" && (
        <MyStockSheet
          stats={matStats}
          onClose={() => setScreen("home")}
          onDone={() => void refresh()}
        />
      )}
      {screen === "activity" && (
        <ActivitySheet
          activity={activity}
          matName={matName}
          onClose={() => setScreen("home")}
        />
      )}

      {reasonModalOpen && tl && (
        <TlMarkReasonModal
          tl={tl}
          onClose={() => setReasonModalOpen(false)}
          onSaved={async () => {
            setReasonModalOpen(false);
            await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-background/50 px-2 py-2.5">
      <div className="font-heading text-lg font-bold text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  iconBg,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  iconBg: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition active:scale-[0.99] hover:bg-muted/30"
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[15px] font-bold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight size={20} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

// ───────────────── Sheet wrapper ─────────────────

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b bg-card px-3 py-3 shadow-sm">
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-foreground hover:bg-muted"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-bold leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="sticky top-0 z-10 border-b bg-background p-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

// ───────────────── Receive sheet ─────────────────

function ReceiveSheet({
  tl,
  materials,
  wdStock,
  matName,
  onClose,
  onDone,
}: {
  tl: TlProfile;
  materials: Material[];
  wdStock: Record<string, number>;
  matName: Map<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const list = materials
    .map((m) => ({ ...m, qty: wdStock[m.code] ?? 0 }))
    .filter((m) => m.qty > 0)
    .filter((m) => matchesSearch(search, m.code, m.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function submitTake(code: string, max: number) {
    const n = Number(qty[code]);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Enter a quantity");
    const cap = Math.floor(max * 0.4);
    if (n > cap) {
      return toast.error(
        `Per-transaction limit: collect up to ${cap} at a time. Split large collections into multiple actions.`,
      );
    }
    if (n > max) return toast.error(`WD has only ${max}`);
    setSubmitting(code);
    const { error } = await supabase.rpc("tl_self_take", { _material_code: code, _qty: n });
    setSubmitting(null);
    if (error) return toast.error(error.message);
    toast.success(`Received ${n} \u00d7 ${matName.get(code) ?? code}`);
    setQty((p) => ({ ...p, [code]: "" }));
    onDone();
  }

  return (
    <Sheet title="Collect Items from WD SOH" subtitle={`From ${tl.wd_code}${tl.wd_name ? ` \u00b7 ${tl.wd_name}` : ""}`} onClose={onClose}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search material\u2026" />
      <div className="p-3">
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {search ? "No matches." : "Nothing available at your WD right now."}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((m) => {
              const v = qty[m.code] ?? "";
              const n = Number(v);
              const cap = Math.floor(m.qty * 0.4);
              const overCap = Number.isFinite(n) && n > cap;
              const overStock = Number.isFinite(n) && n > m.qty;
              const invalid = v !== "" && (!Number.isFinite(n) || n <= 0 || overCap || overStock);
              const isSubmitting = submitting === m.code;
              return (
                <li key={m.code} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold leading-snug text-foreground break-words">
                        {m.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-mono uppercase text-muted-foreground">
                        {m.code}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                        aria-label="View details"
                      >
                        <Eye size={14} />
                      </button>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                        {m.qty} avail
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={m.qty}
                      value={v}
                      onChange={(e) => setQty((p) => ({ ...p, [m.code]: e.target.value }))}
                      placeholder="Qty"
                      className={`w-24 rounded-md border bg-background px-2.5 py-2 text-sm text-foreground ${invalid ? "border-destructive" : ""}`}
                    />
                    <button
                      onClick={() => submitTake(m.code, m.qty)}
                      disabled={isSubmitting || !v || invalid}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition active:scale-[0.97] hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <ArrowDownToLine size={14} />}
                      Receive
                    </button>
                  </div>
                  {invalid && (
                    <p className="mt-1.5 text-[11px] text-destructive">
                      {!Number.isFinite(n) || n <= 0
                        ? "Enter a valid quantity"
                        : overStock
                          ? `Max available: ${m.qty}`
                          : `Per-transaction limit applies. You can collect up to ${cap} at one time. Split large collections into multiple actions.`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────── My Stock sheet ─────────────────

function MyStockSheet({
  stats,
  onClose,
  onDone,
}: {
  stats: Record<string, MatStat>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"used" | "return" | null>(null);
  const [actionQty, setActionQty] = useState("");
  const [submitting, setSubmitting] = useState(false);
  

  const list = Object.values(stats)
    .filter((m) => m.received > 0)
    .filter((m) => matchesSearch(search, m.code, m.name))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

  function toggle(code: string) {
    setExpanded(expanded === code ? null : code);
    setActionKind(null);
    setActionQty("");
  }

  async function submit(code: string, max: number) {
    if (!actionKind) return;
    const n = Number(actionQty);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Enter a quantity");
    if (n > max) return toast.error(`Max allowed: ${max}`);
    setSubmitting(true);
    let error;
    if (actionKind === "used") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase.rpc as any)("tl_self_used", { _material_code: code, _qty: n }));
    } else {
      ({ error } = await supabase.rpc("tl_self_return", { _material_code: code, _qty: n }));
    }
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`${actionKind === "used" ? "Marked used" : "Returned"} ${n}`);
    setActionKind(null);
    setActionQty("");
    setExpanded(null);
    onDone();
  }

  return (
    <Sheet title="My SOH" subtitle="Tap a material to act on it" onClose={onClose}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search your stock…" />
      <div className="p-3">
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {search ? "No matches." : "You haven't received any materials yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((m) => {
              const open = expanded === m.code;
              const v = actionQty;
              const n = Number(v);
              const invalid = v !== "" && (!Number.isFinite(n) || n <= 0 || n > m.balance);
              return (
                <li key={m.code} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <button
                    onClick={() => toggle(m.code)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold leading-snug text-foreground break-words">
                        {m.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-mono uppercase text-muted-foreground">
                        {m.code}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className={`font-heading text-lg font-bold ${m.balance > 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {m.balance}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">on hand</div>
                      </div>
                      <span
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                        role="button"
                      >
                        <Eye size={14} />
                      </span>
                      <ChevronRight size={18} className={`shrink-0 text-muted-foreground transition ${open ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {open && (
                    <div className="space-y-2.5 border-t bg-muted/10 p-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>Received: <strong className="text-foreground">{m.received}</strong></span>
                        <span>Used: <strong className="text-foreground">{m.used}</strong></span>
                        <span>Returned: <strong className="text-foreground">{m.returned}</strong></span>
                        <span>Last used: <strong className="text-foreground">{fmtDate(m.lastUsed)}</strong></span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={m.balance <= 0}
                          onClick={() => { setActionKind("used"); setActionQty(""); }}
                          className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-bold transition disabled:opacity-50 ${actionKind === "used" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-card text-foreground hover:bg-muted"}`}
                        >
                          <CheckCircle2 size={16} />
                          Mark Used
                        </button>
                        <button
                          disabled={m.balance <= 0}
                          onClick={() => { setActionKind("return"); setActionQty(""); }}
                          className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-bold transition disabled:opacity-50 ${actionKind === "return" ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-muted"}`}
                        >
                          <ArrowUpFromLine size={16} />
                          Return
                        </button>
                      </div>
                      {actionKind && (
                        <div className="rounded-lg border bg-card p-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={m.balance}
                              autoFocus
                              value={actionQty}
                              onChange={(e) => setActionQty(e.target.value)}
                              placeholder={`Qty (max ${m.balance})`}
                              className={`flex-1 rounded-md border bg-background px-2.5 py-2 text-sm text-foreground ${invalid ? "border-destructive" : ""}`}
                            />
                            <button
                              onClick={() => submit(m.code, m.balance)}
                              disabled={submitting || !actionQty || invalid}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                            >
                              {submitting && <Loader2 className="animate-spin" size={14} />}
                              Confirm
                            </button>
                          </div>
                          {invalid && (
                            <p className="mt-1.5 text-[11px] text-destructive">
                              {n > m.balance ? `Max allowed: ${m.balance}` : "Enter a valid quantity"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </Sheet>
  );
}

// ───────────────── Activity sheet ─────────────────

function ActivitySheet({
  activity,
  matName,
  onClose,
}: {
  activity: ActivityRow[];
  matName: Map<string, string>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const list = activity.filter((a) =>
    matchesSearch(search, a.material_code, matName.get(a.material_code) ?? ""),
  );

  return (
    <Sheet title="Activity" subtitle={`${activity.length} event${activity.length === 1 ? "" : "s"}`} onClose={onClose}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search activity…" />
      <div className="p-3">
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {search ? "No matches." : "No activity yet."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {list.slice(0, 200).map((a, i) => {
              const meta =
                a.kind === "received"
                  ? { label: "Received from WD", color: "text-primary", bg: "bg-primary/10", sign: "+", Icon: ArrowDownToLine }
                  : a.kind === "used"
                    ? { label: "Marked used", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", sign: "−", Icon: CheckCircle2 }
                    : { label: "Returned to WD", color: "text-muted-foreground", bg: "bg-muted", sign: "−", Icon: ArrowUpFromLine };
              const Icon = meta.Icon;
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}>
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {matName.get(a.material_code) ?? a.material_code}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {meta.label} · {a.date ? new Date(a.date).toLocaleString() : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-heading text-base font-bold ${meta.color}`}>
                    {meta.sign}{a.qty}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

// ───────── Inactivity reason (TL self-service) ─────────

const TL_REASON_OPTIONS: { v: "on_leave" | "no_requirement" | "stock_sufficient" | "other"; l: string }[] = [
  { v: "on_leave", l: "On Leave" },
  { v: "no_requirement", l: "No requirement" },
  { v: "stock_sufficient", l: "Stock already sufficient" },
  { v: "other", l: "Other" },
];

function reasonLabel(r: string): string {
  return TL_REASON_OPTIONS.find((o) => o.v === r)?.l ?? r;
}

function TlMarkReasonModal({
  tl,
  onClose,
  onSaved,
}: {
  tl: TlProfile;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<typeof TL_REASON_OPTIONS[number]["v"]>("on_leave");
  const [leaveUntil, setLeaveUntil] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!user) return;
    if (reason === "on_leave" && !leaveUntil) return toast.error("Pick a date for leave end");
    if (reason === "other" && !comment.trim()) return toast.error("Please mention a reason");
    setSubmitting(true);
    const expires_at =
      reason === "on_leave" ? null : new Date(Date.now() + 7 * 86400000).toISOString();
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
    if (error) return toast.error(error.message);
    toast.success("Reason recorded");
    await onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Submit reason / Apply leave</p>
            <p className="truncate text-sm font-bold">{tl.tl_name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {TL_REASON_OPTIONS.map((o) => (
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
            <label className="text-[10px] font-bold uppercase text-muted-foreground">On leave till</label>
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
