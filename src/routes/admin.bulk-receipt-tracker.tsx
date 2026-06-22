import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, PackageCheck, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/use-roles";
import {
  getReceiptPlanTracker,
  deleteReceiptPlan,
  type ReceiptPlanTrackerRow,
} from "@/lib/receipt-plan.functions";

export const Route = createFileRoute("/admin/bulk-receipt-tracker")({
  component: BulkReceiptTrackerPage,
  head: () => ({ meta: [{ title: "Bulk Receipt Tracker — POSM Tracker" }] }),
});

const STATUS_STYLES: Record<
  ReceiptPlanTrackerRow["status"],
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "border-success/30 bg-success/10 text-success" },
  in_progress: {
    label: "In Progress",
    className: "border-warning/30 bg-warning/10 text-warning-foreground",
  },
  pending: {
    label: "Pending",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

function BulkReceiptTrackerPage() {
  const { isAdmin, isSuperAdmin, loading: rolesLoading } = useRoles();
  const fetchTracker = useServerFn(getReceiptPlanTracker);
  const removePlan = useServerFn(deleteReceiptPlan);
  const [rows, setRows] = useState<ReceiptPlanTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchTracker();
      setRows(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rolesLoading || !isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoading, isAdmin]);

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete plan ${code}? Items already received cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await removePlan({ data: { planId: id } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  if (!rolesLoading && !isAdmin) {
    return (
      <AppShell>
        <div className="p-4 text-sm text-muted-foreground">Admin only.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <AdminTabs />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <PackageCheck size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-bold text-foreground">
                Receipt Plan Tracker
              </h1>
              <p className="text-xs text-muted-foreground">
                Pending and completed receipt plans across WSPs.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/bulk-receipt">
              <ArrowLeft /> Upload
            </Link>
          </Button>
        </header>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            No receipt plans yet.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Plan ID</th>
                    <th className="px-3 py-2.5">Upload Date</th>
                    <th className="px-3 py-2.5">WSP</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Received</th>
                    <th className="px-3 py-2.5 text-right">Pending</th>
                    <th className="px-3 py-2.5">Status</th>
                    {isSuperAdmin && <th className="px-3 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-3 font-mono font-bold text-primary">{p.plan_code}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 font-mono">{p.wsp}</td>
                      <td className="px-3 py-3 text-right font-semibold">{p.total_items}</td>
                      <td className="px-3 py-3 text-right font-semibold text-success">
                        {p.received_items}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-destructive">
                        {p.pending_items}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[p.status].className}`}
                        >
                          {STATUS_STYLES[p.status].label}
                        </span>
                      </td>
                      {isSuperAdmin && (
                        <td className="px-3 py-3 text-right">
                          {p.received_items === 0 && (
                            <button
                              onClick={() => void handleDelete(p.id, p.plan_code)}
                              disabled={deletingId === p.id}
                              className="rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20"
                              aria-label="Delete"
                            >
                              {deletingId === p.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 lg:hidden">
              {rows.map((p) => (
                <article key={p.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-bold text-primary">{p.plan_code}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()} · {p.wsp}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[p.status].className}`}
                    >
                      {STATUS_STYLES[p.status].label}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                      <p className="font-bold">{p.total_items}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Received</p>
                      <p className="font-bold text-success">{p.received_items}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Pending</p>
                      <p className="font-bold text-destructive">{p.pending_items}</p>
                    </div>
                  </div>
                  {isSuperAdmin && p.received_items === 0 && (
                    <button
                      onClick={() => void handleDelete(p.id, p.plan_code)}
                      disabled={deletingId === p.id}
                      className="mt-2 flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-bold text-destructive"
                    >
                      {deletingId === p.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      Delete
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
