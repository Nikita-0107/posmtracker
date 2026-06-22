import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Loader2, ChevronRight, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  listMyReceiptPlans,
  type ReceiptPlanSummary,
} from "@/lib/receipt-plan.functions";

export const Route = createFileRoute("/receipt-plans")({
  component: ReceiptPlansListPage,
  head: () => ({ meta: [{ title: "Pending Receipt Plans — POSM Tracker" }] }),
});

const STATUS_STYLES: Record<ReceiptPlanSummary["status"], { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning-foreground" },
  pending: { label: "Pending", className: "bg-primary/10 text-primary" },
};

function ReceiptPlansListPage() {
  const fetchList = useServerFn(listMyReceiptPlans);
  const [plans, setPlans] = useState<ReceiptPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchList()
      .then((r) => alive && setPlans(r))
      .catch((e: unknown) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchList]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4 pb-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ClipboardList size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">Pending Receipt Plans</h2>
            <p className="text-[11px] text-muted-foreground">
              Confirm planned material receipts with proof image.
            </p>
          </div>
        </div>

        <Link
          to="/receive"
          className="flex items-center justify-between rounded-xl border bg-card px-3 py-3 text-xs"
        >
          <span className="flex items-center gap-2 font-semibold">
            <Inbox size={14} className="text-muted-foreground" />
            Need to do a manual receipt instead?
          </span>
          <ChevronRight size={14} className="text-muted-foreground" />
        </Link>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : plans.length === 0 ? (
          <p className="rounded-xl border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
            No pending receipt plans.
          </p>
        ) : (
          <ul className="space-y-2">
            {plans.map((p) => {
              const pending = p.total_items - p.received_items;
              return (
                <li key={p.id}>
                  <Link
                    to="/receipt-plans/$planId"
                    params={{ planId: p.id }}
                    className="block rounded-xl border bg-card p-3 transition active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-bold">{p.plan_code}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.wsp} · {p.total_items} item{p.total_items === 1 ? "" : "s"} ·{" "}
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status].className}`}
                      >
                        {STATUS_STYLES[p.status].label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px]">
                      <span className="text-success">{p.received_items} received</span>
                      <span className="text-destructive">{pending} pending</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
