import { Link } from "@tanstack/react-router";
import { ClipboardList, ChevronRight, Calendar, Loader2 } from "lucide-react";
import { usePendingDispatchPlans } from "@/hooks/use-dispatch-plans";

export function DispatchPlanQueue() {
  const { plans, loading } = usePendingDispatchPlans();

  if (loading) {
    return (
      <section className="rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-3 text-center text-xs text-muted-foreground">
        <Loader2 size={14} className="mr-1 inline animate-spin" /> Loading dispatch queue…
      </section>
    );
  }
  if (plans.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Pending Dispatch Plans</h3>
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          {plans.length}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pre-planned dispatches uploaded by Admin. Open one to execute.
      </p>
      <div className="space-y-2">
        {plans.map((p) => (
          <Link
            key={p.id}
            to="/wd-issue"
            search={{ planId: p.id }}
            className="flex items-center gap-2 rounded-lg border bg-card p-2.5 text-left transition hover:border-primary active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-primary">{p.plan_code}</span>
                <span className="text-[10px] text-muted-foreground">
                  <Calendar size={9} className="mr-0.5 inline" />
                  {p.plan_date}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-foreground">WD {p.wd_code}</p>
              <p className="text-[10px] text-muted-foreground">
                {p.items.length} material{p.items.length === 1 ? "" : "s"} · Pending Execution
              </p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}
