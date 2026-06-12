import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BulkDispatchExecutionStatus = "completed" | "in_progress" | "pending";

export type BulkDispatchTrackerPlan = {
  id: string;
  planCode: string;
  uploadedAt: string;
  wsp: string;
  wdCode: string;
  materialCount: number;
  plannedQty: number;
  dispatchedQty: number;
  pendingQty: number;
  status: BulkDispatchExecutionStatus;
};

export type BulkDispatchTrackerReport = {
  plans: BulkDispatchTrackerPlan[];
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  };
  pendingWorkloadByWsp: Array<{
    wsp: string;
    plans: number;
    quantity: number;
  }>;
};

type PlanRow = {
  id: string;
  plan_code: string;
  created_at: string;
  wsp: string;
  wd_code: string;
  status: string;
  dispatch_plan_items: Array<{
    planned_qty: number;
    actual_qty: number | null;
  }> | null;
};

export const getBulkDispatchTrackerReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BulkDispatchTrackerReport> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await context.supabase
      .from("dispatch_plans")
      .select(
        "id, plan_code, created_at, wsp, wd_code, status, dispatch_plan_items(planned_qty, actual_qty)",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const plans = ((data ?? []) as PlanRow[]).map((plan) => {
      const items = plan.dispatch_plan_items ?? [];
      const plannedQty = items.reduce((sum, item) => sum + item.planned_qty, 0);
      const dispatchedQty = items.reduce((sum, item) => sum + (item.actual_qty ?? 0), 0);
      const status: BulkDispatchExecutionStatus =
        dispatchedQty <= 0
          ? "pending"
          : dispatchedQty >= plannedQty
            ? "completed"
            : "in_progress";

      return {
        id: plan.id,
        planCode: plan.plan_code,
        uploadedAt: plan.created_at,
        wsp: plan.wsp,
        wdCode: plan.wd_code,
        materialCount: items.length,
        plannedQty,
        dispatchedQty,
        pendingQty: Math.max(plannedQty - dispatchedQty, 0),
        status,
      };
    });

    const summary = plans.reduce(
      (totals, plan) => {
        totals.total += 1;
        if (plan.status === "completed") totals.completed += 1;
        if (plan.status === "in_progress") totals.inProgress += 1;
        if (plan.status === "pending") totals.pending += 1;
        return totals;
      },
      { total: 0, completed: 0, inProgress: 0, pending: 0 },
    );

    const workload = new Map<string, { plans: number; quantity: number }>();
    for (const plan of plans) {
      if (plan.pendingQty <= 0) continue;
      const current = workload.get(plan.wsp) ?? { plans: 0, quantity: 0 };
      current.plans += 1;
      current.quantity += plan.pendingQty;
      workload.set(plan.wsp, current);
    }

    return {
      plans,
      summary,
      pendingWorkloadByWsp: Array.from(workload, ([wsp, totals]) => ({ wsp, ...totals })).sort(
        (a, b) => b.quantity - a.quantity,
      ),
    };
  });