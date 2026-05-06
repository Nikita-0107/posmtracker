import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Loader2, RefreshCw, AlertTriangle, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/tl")({
  component: TlPortalPage,
  head: () => ({
    meta: [
      { title: "TL Portal — POSM Tracker" },
      { name: "description", content: "Take stock and return stock for your assigned WD." },
    ],
  }),
});

type TlProfile = {
  id: string;
  tl_name: string;
  legacy_tl_id: number | null;
  tl_type: string | null;
  wd_code: string;
};

type Material = { code: string; name: string };
type StockRow = { material_code: string; qty: number };

type ActivityRow = {
  kind: "take" | "return";
  date: string;
  material_code: string;
  qty: number;
};

function tlMeta(t: TlProfile) {
  return [t.legacy_tl_id, t.tl_type].filter(Boolean).join(" • ");
}

function TlPortalPage() {
  const { user, profile } = useAuth();
  const [tl, setTl] = useState<TlProfile | null>(null);
  const [tlLoadErr, setTlLoadErr] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"take" | "return" | "history">("take");

  const [takeMat, setTakeMat] = useState<string>("");
  const [takeQty, setTakeQty] = useState<string>("");
  const [retMat, setRetMat] = useState<string>("");
  const [retQty, setRetQty] = useState<string>("");
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
    // Find TL profile linked to this user
    const { data: tlRow, error: tlErr } = await supabase
      .from("wd_tls")
      .select("id, tl_name, legacy_tl_id, tl_type, wd_code")
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
    setTl(tlInfo);

    const [matsRes, stockRes, issRes, retRes] = await Promise.all([
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
    ]);

    setMaterials((matsRes.data ?? []) as Material[]);
    const s: Record<string, number> = {};
    for (const r of (stockRes.data ?? []) as StockRow[]) s[r.material_code] = r.qty;
    setStock(s);

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

    const allocated: Record<string, number> = {};
    for (const it of issItems) {
      allocated[it.material_code] = (allocated[it.material_code] ?? 0) + it.qty_issued;
    }
    const returns = (retRes.data ?? []) as unknown as {
      material_code: string;
      qty: number;
      created_at: string;
    }[];
    const returned: Record<string, number> = {};
    for (const r of returns) {
      returned[r.material_code] = (returned[r.material_code] ?? 0) + r.qty;
    }
    const pend: Record<string, number> = {};
    const codes = new Set([...Object.keys(allocated), ...Object.keys(returned)]);
    codes.forEach((c) => {
      const v = (allocated[c] ?? 0) - (returned[c] ?? 0);
      if (v > 0) pend[c] = v;
    });
    setPending(pend);

    // Build activity timeline
    const issCreated = new Map(issuances.map((i) => [i.id, i.created_at]));
    const acts: ActivityRow[] = [];
    for (const it of issItems) {
      acts.push({
        kind: "take",
        date: issCreated.get(it.issuance_id) ?? "",
        material_code: it.material_code,
        qty: it.qty_issued,
      });
    }
    for (const r of returns) {
      acts.push({
        kind: "return",
        date: r.created_at,
        material_code: r.material_code,
        qty: r.qty,
      });
    }
    acts.sort((a, b) => (a.date < b.date ? 1 : -1));
    setActivity(acts.slice(0, 25));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: subscribe to wd_stock changes for this TL's WD so the available
  // pool updates live when other TLs in the same WD take/return.
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

  async function handleTake() {
    if (!takeMat) return toast.error("Pick a material");
    const qty = Number(takeQty);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a quantity");
    const avail = stock[takeMat] ?? 0;
    if (qty > avail) return toast.error(`Only ${avail} available at WD`);
    setSubmitting(true);
    const { error } = await supabase.rpc("tl_self_take", {
      _material_code: takeMat,
      _qty: qty,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Took ${qty} × ${matName.get(takeMat) ?? takeMat}`);
    setTakeMat("");
    setTakeQty("");
    void refresh();
  }

  async function handleReturn() {
    if (!retMat) return toast.error("Pick a material");
    const qty = Number(retQty);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a quantity");
    const pend = pending[retMat] ?? 0;
    if (qty > pend) return toast.error(`Only ${pend} pending with you`);
    setSubmitting(true);
    const { error } = await supabase.rpc("tl_self_return", {
      _material_code: retMat,
      _qty: qty,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Returned ${qty} × ${matName.get(retMat) ?? retMat}`);
    setRetMat("");
    setRetQty("");
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

  const pendingCount = Object.values(pending).reduce((a, b) => a + b, 0);
  const sortedAvail = materials
    .map((m) => ({ ...m, qty: stock[m.code] ?? 0 }))
    .filter((m) => m.qty > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  const sortedPending = Object.entries(pending)
    .map(([code, qty]) => ({ code, name: matName.get(code) ?? code, qty }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Header card */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-lg font-bold text-foreground">
                {tl.tl_name}
                {tlMeta(tl) && (
                  <span className="ml-2 text-xs font-normal opacity-70">({tlMeta(tl)})</span>
                )}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                WD: <strong className="text-primary">{tl.wd_code}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-bold text-foreground">
                Pending with you: <span className="text-primary">{pendingCount}</span>
              </span>
              <button
                onClick={() => void refresh()}
                className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal tabs */}
        <div className="flex gap-2 overflow-x-auto rounded-xl bg-muted p-1">
          {([
            { k: "take", label: "Take Stock", icon: ArrowDownToLine },
            { k: "return", label: "Return Stock", icon: ArrowUpFromLine },
            { k: "history", label: "Activity", icon: History },
          ] as const).map(({ k, label, icon: Icon }) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {tab === "take" && (
          <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <Boxes size={16} className="text-primary" /> Available stock at WD {tl.wd_code}
            </h2>
            {sortedAvail.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                Nothing available at your WD right now.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sortedAvail.map((m) => {
                  const active = takeMat === m.code;
                  return (
                    <button
                      key={m.code}
                      onClick={() => setTakeMat(m.code)}
                      className={`flex min-w-[170px] shrink-0 flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        {m.code}
                      </span>
                      <span className="line-clamp-2 text-xs font-bold text-foreground">
                        {m.name}
                      </span>
                      <span className="text-[11px] font-bold text-primary">
                        Available: {m.qty}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
              <select
                value={takeMat}
                onChange={(e) => setTakeMat(e.target.value)}
                className="rounded-md border bg-background px-2 py-2 text-sm font-medium text-foreground"
              >
                <option value="">— Select material —</option>
                {sortedAvail.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name} (Available {m.qty})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={takeMat ? stock[takeMat] ?? undefined : undefined}
                value={takeQty}
                onChange={(e) => setTakeQty(e.target.value)}
                placeholder="Qty"
                className="rounded-md border bg-background px-2 py-2 text-sm font-medium text-foreground"
              />
              <button
                disabled={submitting || !takeMat || !takeQty}
                onClick={handleTake}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : <ArrowDownToLine size={14} />}
                Take Stock
              </button>
            </div>
            {takeMat && (
              <p className="text-[11px] text-muted-foreground">
                Available at WD: <strong className="text-foreground">{stock[takeMat] ?? 0}</strong>{" "}
                · Cannot take more than available.
              </p>
            )}
          </section>
        )}

        {tab === "return" && (
          <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <ArrowUpFromLine size={16} className="text-primary" /> Your pending stock
            </h2>
            {sortedPending.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                Nothing pending with you.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sortedPending.map((m) => {
                  const active = retMat === m.code;
                  return (
                    <button
                      key={m.code}
                      onClick={() => setRetMat(m.code)}
                      className={`flex min-w-[170px] shrink-0 flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        {m.code}
                      </span>
                      <span className="line-clamp-2 text-xs font-bold text-foreground">
                        {m.name}
                      </span>
                      <span className="text-[11px] font-bold text-primary">
                        Pending: {m.qty}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
              <select
                value={retMat}
                onChange={(e) => setRetMat(e.target.value)}
                className="rounded-md border bg-background px-2 py-2 text-sm font-medium text-foreground"
              >
                <option value="">— Select material —</option>
                {sortedPending.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name} (Pending {m.qty})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={retMat ? pending[retMat] ?? undefined : undefined}
                value={retQty}
                onChange={(e) => setRetQty(e.target.value)}
                placeholder="Qty"
                className="rounded-md border bg-background px-2 py-2 text-sm font-medium text-foreground"
              />
              <button
                disabled={submitting || !retMat || !retQty}
                onClick={handleReturn}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : <ArrowUpFromLine size={14} />}
                Return Stock
              </button>
            </div>
            {retMat && (
              <p className="text-[11px] text-muted-foreground">
                Pending with you: <strong className="text-foreground">{pending[retMat] ?? 0}</strong>{" "}
                · Cannot return more than pending.
              </p>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <History size={16} className="text-primary" /> Recent activity
            </h2>
            {activity.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-background">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
                          a.kind === "take"
                            ? "bg-primary/10 text-primary"
                            : "bg-success/10 text-success"
                        }`}
                      >
                        {a.kind === "take" ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-foreground">
                          {matName.get(a.material_code) ?? a.material_code}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {a.date ? new Date(a.date).toLocaleString() : ""}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        a.kind === "take" ? "text-primary" : "text-success"
                      }`}
                    >
                      {a.kind === "take" ? "−" : "+"}
                      {a.qty}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
