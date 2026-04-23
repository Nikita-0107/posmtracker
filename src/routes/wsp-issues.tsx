import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RotateCw,
  Clock,
  XOctagon,
  Package,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useMaterials } from "@/hooks/use-stock";
import { useWspIssues, resolveDispatchIssue, type ResolveAction } from "@/hooks/use-wsp-issues";
import { wdMaster } from "@/lib/posm-data";
import { toast } from "sonner";

export const Route = createFileRoute("/wsp-issues")({
  component: WspIssuesPage,
  head: () => ({
    meta: [
      { title: "Issues Raised by WD — POSM Tracker" },
      {
        name: "description",
        content: "Review and resolve dispatch issues reported by distributors.",
      },
    ],
  }),
});

function WspIssuesPage() {
  const { rows, loading, refresh } = useWspIssues();
  const { materials } = useMaterials();
  const matMap = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">
                Issues Raised by WD
              </h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Distributor-reported issues for your dispatches
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading issues…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-success" size={24} />
            <p className="text-sm font-bold text-foreground">No open issues</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              When a WD flags a dispatch line, it will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <IssueCard
                key={r.id}
                row={r}
                materialName={matMap.get(r.material_code) ?? ""}
                onChange={refresh}
              />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            to="/"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function IssueCard({
  row,
  materialName,
  onChange,
}: {
  row: ReturnType<typeof useWspIssues>["rows"][number];
  materialName: string;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<ResolveAction | null>(null);
  const [showRedispatch, setShowRedispatch] = useState(false);
  const [redispatchQty, setRedispatchQty] = useState(String(row.qty));

  const wdName =
    wdMaster.find((w) => w.wd_code === row.distributor)?.wd_name ?? row.distributor ?? "—";

  async function act(action: ResolveAction) {
    if (action === "redispatch" && !showRedispatch) {
      setShowRedispatch(true);
      return;
    }
    let qty: number | undefined;
    if (action === "redispatch") {
      qty = Number(redispatchQty);
      if (!qty || qty <= 0) {
        toast.error("Enter a valid quantity");
        return;
      }
    }
    setBusy(action);
    const { error } = await resolveDispatchIssue(row.id, action, qty);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (action === "accept_loss") toast.success("Marked as Closed — Loss");
    else if (action === "redispatch") toast.success("Re-dispatch created, issue resolved");
    else toast.message("Kept pending");
    setShowRedispatch(false);
    await onChange();
  }

  const dateStr = row.confirmed_at
    ? new Date(row.confirmed_at).toLocaleString()
    : row.dispatch_date ?? "—";

  return (
    <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
          <Package size={16} className="text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
              {(row.dispatch_id ?? row.id).slice(0, 8)}
            </span>
            <span className="shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
              Issue
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">
            To <span className="text-muted-foreground">{wdName}</span>
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              ({row.distributor})
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">{dateStr}</p>
        </div>
        <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-right">
          <p className="font-mono text-sm font-bold text-foreground">{row.qty}</p>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <p className="font-mono text-[11px] font-bold text-foreground">
            {row.material_code}
          </p>
          <p className="text-[10px] text-muted-foreground">{materialName}</p>
        </div>

        <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive">
          <span className="mr-1 font-bold uppercase tracking-wide text-[9px]">Reason:</span>
          {row.issue_note?.trim() || "(no reason given)"}
        </div>

        {showRedispatch && (
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Re-dispatch quantity
            </span>
            <input
              type="number"
              min={1}
              value={redispatchQty}
              onChange={(e) => setRedispatchQty(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-mono text-foreground"
            />
          </label>
        )}

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            onClick={() => act("accept_loss")}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-destructive/10 py-2 text-[10px] font-bold text-destructive transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "accept_loss" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XOctagon size={14} />
            )}
            Accept Loss
          </button>
          <button
            onClick={() => act("redispatch")}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-primary py-2 text-[10px] font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "redispatch" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCw size={14} />
            )}
            {showRedispatch ? "Confirm" : "Re-dispatch"}
          </button>
          <button
            onClick={() => act("keep_pending")}
            disabled={busy !== null}
            className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-muted py-2 text-[10px] font-bold text-foreground transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "keep_pending" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Clock size={14} />
            )}
            Keep Pending
          </button>
        </div>
      </div>
    </div>
  );
}
