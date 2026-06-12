import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Clock3, Loader2, PackageCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useRoles } from "@/hooks/use-roles";
import {
  getBulkDispatchTrackerReport,
  type BulkDispatchExecutionStatus,
  type BulkDispatchTrackerReport,
} from "@/lib/bulk-dispatch-tracker.functions";

export const Route = createFileRoute("/admin/bulk-dispatch-tracker")({
  component: BulkDispatchTrackerPage,
  head: () => ({ meta: [{ title: "Bulk Dispatch Tracker — POSM Tracker" }] }),
});

const numberFormatter = new Intl.NumberFormat("en-IN");

const statusDetails: Record<
  BulkDispatchExecutionStatus,
  { label: string; className: string; dotClassName: string }
> = {
  completed: {
    label: "Completed",
    className: "border-success/30 bg-success/10 text-success",
    dotClassName: "bg-success",
  },
  in_progress: {
    label: "In Progress",
    className: "border-warning/30 bg-warning/10 text-warning-foreground",
    dotClassName: "bg-warning",
  },
  pending: {
    label: "Pending",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
};

function BulkDispatchTrackerPage() {
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const fetchReport = useServerFn(getBulkDispatchTrackerReport);
  const [report, setReport] = useState<BulkDispatchTrackerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rolesLoading) return;
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    void fetchReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load tracker");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchReport, isSuperAdmin, rolesLoading]);

  const maxWorkload = useMemo(
    () => Math.max(...(report?.pendingWorkloadByWsp.map((item) => item.quantity) ?? []), 1),
    [report],
  );

  if (!rolesLoading && !isSuperAdmin) {
    return (
      <AppShell>
        <div className="p-4 text-sm text-muted-foreground">Super Admin only.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <AdminTabs />
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <PackageCheck size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-foreground">Bulk Dispatch Tracker</h1>
            <p className="text-xs text-muted-foreground">
              Plan execution visibility from upload through completion.
            </p>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Loading dispatch plans…
          </div>
        ) : error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : report ? (
          <>
            <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Plan summary">
              <SummaryCard label="Total Plans" value={report.summary.total} icon={PackageCheck} />
              <SummaryCard label="Completed" value={report.summary.completed} icon={CheckCircle2} tone="success" />
              <SummaryCard label="In Progress" value={report.summary.inProgress} icon={Clock3} tone="warning" />
              <SummaryCard label="Pending" value={report.summary.pending} icon={CircleDashed} tone="destructive" />
            </section>

            <section className="border-y py-4">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-foreground">Pending workload by WSP</h2>
                <p className="text-[11px] text-muted-foreground">Ranked by quantity still to dispatch.</p>
              </div>
              {report.pendingWorkloadByWsp.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending dispatch workload.</p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-3">
                  {report.pendingWorkloadByWsp.map((item) => (
                    <div key={item.wsp}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-foreground">{item.wsp}</span>
                        <span className="text-muted-foreground">
                          {item.plans} plan{item.plans === 1 ? "" : "s"} · {numberFormatter.format(item.quantity)} qty
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive"
                          style={{ width: `${Math.max((item.quantity / maxWorkload) * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-foreground">All uploaded plans</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Dispatched quantity reflects the actual quantities recorded during plan execution.
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                  {report.plans.length} records
                </span>
              </div>

              <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Plan ID</th>
                      <th className="px-3 py-2.5">Upload Date</th>
                      <th className="px-3 py-2.5">WSP</th>
                      <th className="px-3 py-2.5">WD Code</th>
                      <th className="px-3 py-2.5 text-right">Materials</th>
                      <th className="px-3 py-2.5 text-right">Planned</th>
                      <th className="px-3 py-2.5 text-right">Dispatched</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.plans.map((plan) => (
                      <tr key={plan.id} className="border-t">
                        <td className="px-3 py-3 font-mono font-bold text-primary">{plan.planCode}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatDate(plan.uploadedAt)}</td>
                        <td className="px-3 py-3 font-mono">{plan.wsp}</td>
                        <td className="px-3 py-3 font-mono font-semibold">{plan.wdCode}</td>
                        <td className="px-3 py-3 text-right">{plan.materialCount}</td>
                        <td className="px-3 py-3 text-right font-semibold">{numberFormatter.format(plan.plannedQty)}</td>
                        <td className="px-3 py-3 text-right font-semibold">{numberFormatter.format(plan.dispatchedQty)}</td>
                        <td className="px-3 py-3"><StatusBadge status={plan.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 lg:hidden">
                {report.plans.map((plan) => (
                  <article key={plan.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-bold text-primary">{plan.planCode}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(plan.uploadedAt)}</p>
                      </div>
                      <StatusBadge status={plan.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <Metric label="WSP / WD" value={`${plan.wsp} / ${plan.wdCode}`} mono />
                      <Metric label="Materials" value={String(plan.materialCount)} />
                      <Metric label="Planned Qty" value={numberFormatter.format(plan.plannedQty)} />
                      <Metric label="Dispatched Qty" value={numberFormatter.format(plan.dispatchedQty)} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: typeof PackageCheck;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={16} />
      </div>
      <p className="font-mono text-2xl font-bold text-foreground">{numberFormatter.format(value)}</p>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: BulkDispatchExecutionStatus }) {
  const details = statusDetails[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${details.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${details.dotClassName}`} />
      {details.label}
    </span>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-semibold text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}