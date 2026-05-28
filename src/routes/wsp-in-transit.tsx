import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Truck,
  Package,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { useMaterials } from "@/hooks/use-stock";
import { wdMaster } from "@/lib/posm-data";

export const Route = createFileRoute("/wsp-in-transit")({
  component: WspInTransitPage,
  head: () => ({
    meta: [
      { title: "In Transit to WD — POSM Tracker" },
      {
        name: "description",
        content: "Track dispatches sent to distributors and their per-item status.",
      },
    ],
  }),
});

type Row = {
  id: string;
  created_at: string;
  dispatch_id: string | null;
  dispatch_date: string | null;
  wsp: string;
  distributor: string | null;
  material_code: string;
  qty: number;
  item_status: "pending" | "received" | "issue" | string;
  issue_note: string | null;
};

type Group = {
  dispatch_id: string;
  distributor: string;
  dispatch_date: string;
  created_at: string;
  items: Row[];
};

function deriveGroupStatus(items: Row[]) {
  const total = items.length;
  const recv = items.filter((i) => i.item_status === "received").length;
  const pend = items.filter((i) => i.item_status === "pending").length;
  const issue = items.filter((i) => i.item_status === "issue").length;
  if (recv === total) return { label: "Received", color: "bg-success/15 text-success" };
  if (recv > 0) return { label: "Partially Received", color: "bg-amber-100 text-amber-700" };
  if (issue > 0 && pend === 0)
    return { label: "Issue", color: "bg-destructive/15 text-destructive" };
  return { label: "In Transit", color: "bg-primary/15 text-primary" };
}

function itemStatusBadge(status: string) {
  if (status === "received")
    return { label: "Received", color: "bg-success/15 text-success", Icon: CheckCircle2 };
  if (status === "issue")
    return { label: "Issue", color: "bg-destructive/15 text-destructive", Icon: AlertTriangle };
  return { label: "In Transit", color: "bg-primary/15 text-primary", Icon: Clock };
}

function WspInTransitPage() {
  const { user, profile } = useAuth();
  const { materials } = useMaterials();
  const matMap = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, created_at, dispatch_id, dispatch_date, wsp, distributor, material_code, qty, item_status, issue_note",
      )
      .eq("movement", "dispatch")
      .in("item_status", ["pending", "received", "issue"])
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load in-transit dispatches", error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`wsp-in-transit-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.dispatch_id ?? r.id;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    const out: Group[] = [];
    for (const [id, items] of map.entries()) {
      const hasPending = items.some((i) => i.item_status === "pending");
      const recv = items.filter((i) => i.item_status === "received").length;
      const partial = recv > 0 && recv < items.length;
      if (!hasPending && !partial) continue;
      out.push({
        dispatch_id: id,
        distributor: items[0]?.distributor ?? "",
        dispatch_date: items[0]?.dispatch_date ?? "",
        created_at: items[0]?.created_at ?? "",
        items,
      });
    }
    return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [rows]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Truck size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold leading-tight">In Transit to WD</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {profile?.wsp ? (
                <>
                  Dispatches from <strong className="text-primary">{profile.wsp}</strong> awaiting
                  WD confirmation
                </>
              ) : (
                "Dispatches awaiting WD confirmation"
              )}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <Inbox className="mx-auto mb-2 text-muted-foreground" size={24} />
            <p className="text-sm font-bold text-foreground">Nothing in transit</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              All your dispatches have been confirmed.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {groups.map((g) => (
            <DispatchCard key={g.dispatch_id} group={g} matMap={matMap} />
          ))}
        </div>

        <div className="pt-2 text-center">
          <Link to="/" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function DispatchCard({
  group,
  matMap,
}: {
  group: Group;
  matMap: Map<string, string>;
}) {
  const [open, setOpen] = useState(true);
  const status = deriveGroupStatus(group.items);
  const wdName =
    wdMaster.find((w) => w.wd_code === group.distributor)?.wd_name ?? group.distributor;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Package size={16} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
              {group.dispatch_id.slice(0, 8)}
            </span>
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${status.color}`}
            >
              {status.label}
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">
            To <span className="text-muted-foreground">{wdName || "—"}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {group.dispatch_date || "—"} · {group.items.length} items
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-1.5 border-t bg-muted/20 p-2">
          {group.items.map((item) => {
            const b = itemStatusBadge(item.item_status);
            const Icon = b.Icon;
            return (
              <div key={item.id} className="rounded-lg border bg-card p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] font-bold text-foreground">
                      {item.material_code}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {matMap.get(item.material_code) ?? ""}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-right">
                    <p className="font-mono text-sm font-bold text-foreground">{item.qty}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${b.color}`}
                  >
                    <Icon size={10} />
                    {b.label}
                  </span>
                  {item.item_status === "issue" && item.issue_note && (
                    <span className="truncate text-[10px] italic text-destructive">
                      {item.issue_note}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
