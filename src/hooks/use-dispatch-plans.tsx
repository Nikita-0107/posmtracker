import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import type { WspCode } from "@/hooks/use-auth";

export type DispatchPlanStatus = "pending" | "executed" | "cancelled";

export type DispatchPlanItem = {
  id: string;
  plan_id: string;
  material_code: string;
  planned_qty: number;
  actual_qty: number | null;
};

export type DispatchPlan = {
  id: string;
  plan_code: string;
  wsp: WspCode;
  wd_code: string;
  plan_date: string;
  status: DispatchPlanStatus;
  created_at: string;
  items: DispatchPlanItem[];
};

/** List pending plans for the active (effective) WSP. */
export function usePendingDispatchPlans() {
  const { wsp } = useEffectiveWsp();
  const [plans, setPlans] = useState<DispatchPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!wsp) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: planRows, error } = await supabase
      .from("dispatch_plans")
      .select("id, plan_code, wsp, wd_code, plan_date, status, created_at")
      .eq("wsp", wsp)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load dispatch plans", error);
      setPlans([]);
      setLoading(false);
      return;
    }
    const ids = (planRows ?? []).map((p) => p.id);
    if (ids.length === 0) {
      setPlans([]);
      setLoading(false);
      return;
    }
    const { data: itemRows } = await supabase
      .from("dispatch_plan_items")
      .select("id, plan_id, material_code, planned_qty, actual_qty")
      .in("plan_id", ids);
    const itemsByPlan: Record<string, DispatchPlanItem[]> = {};
    for (const it of (itemRows ?? []) as DispatchPlanItem[]) {
      (itemsByPlan[it.plan_id] ??= []).push(it);
    }
    setPlans(
      (planRows ?? []).map((p) => ({
        ...(p as Omit<DispatchPlan, "items">),
        items: itemsByPlan[p.id] ?? [],
      })),
    );
    setLoading(false);
  }, [wsp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { plans, loading, refresh };
}

/** Fetch a single plan by id (with items). RLS scopes to user's WSP. */
export async function fetchDispatchPlan(planId: string): Promise<DispatchPlan | null> {
  const { data: plan, error } = await supabase
    .from("dispatch_plans")
    .select("id, plan_code, wsp, wd_code, plan_date, status, created_at")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan) return null;
  const { data: items } = await supabase
    .from("dispatch_plan_items")
    .select("id, plan_id, material_code, planned_qty, actual_qty")
    .eq("plan_id", planId);
  return { ...(plan as Omit<DispatchPlan, "items">), items: (items ?? []) as DispatchPlanItem[] };
}

/** Mark plan executed and store actual qtys + linked dispatch_id. */
export async function markPlanExecuted(
  planId: string,
  dispatchId: string,
  itemActuals: { itemId: string; actualQty: number }[],
) {
  const userResp = await supabase.auth.getUser();
  const userId = userResp.data.user?.id ?? null;

  // Update item actuals
  await Promise.all(
    itemActuals.map(({ itemId, actualQty }) =>
      supabase.from("dispatch_plan_items").update({ actual_qty: actualQty }).eq("id", itemId),
    ),
  );

  return supabase
    .from("dispatch_plans")
    .update({
      status: "executed",
      executed_at: new Date().toISOString(),
      executed_by: userId,
      dispatch_id: dispatchId,
    })
    .eq("id", planId);
}

export async function cancelPlan(planId: string) {
  const userResp = await supabase.auth.getUser();
  const userId = userResp.data.user?.id ?? null;
  return supabase
    .from("dispatch_plans")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId })
    .eq("id", planId);
}

export type BulkPlanRow = {
  wsp: WspCode;
  wd_code: string;
  material_code: string;
  qty: number;
};

export type BulkPlanResult = {
  plansCreated: number;
  planCodes: string[];
  wdsImpacted: number;
  materialsImported: number;
};

/** Group validated rows by (wsp, wd_code) and insert plans + items. */
export async function createBulkPlans(rows: BulkPlanRow[]): Promise<{
  result: BulkPlanResult | null;
  error: string | null;
}> {
  const userResp = await supabase.auth.getUser();
  const userId = userResp.data.user?.id;
  if (!userId) return { result: null, error: "Not signed in" };

  const groups = new Map<string, BulkPlanRow[]>();
  for (const r of rows) {
    const key = `${r.wsp}|${r.wd_code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const planCodes: string[] = [];
  const wdSet = new Set<string>();
  const matSet = new Set<string>();
  let itemCount = 0;

  for (const [key, groupRows] of groups) {
    const [wsp, wd_code] = key.split("|") as [WspCode, string];
    const { data: plan, error: planErr } = await supabase
      .from("dispatch_plans")
      .insert({ wsp, wd_code, created_by: userId, plan_code: "" })
      .select("id, plan_code")
      .single();
    if (planErr || !plan) {
      return { result: null, error: planErr?.message ?? "Failed to create plan" };
    }
    planCodes.push(plan.plan_code);
    wdSet.add(wd_code);

    // Merge duplicate materials within a single plan
    const merged = new Map<string, number>();
    for (const it of groupRows) {
      merged.set(it.material_code, (merged.get(it.material_code) ?? 0) + it.qty);
      matSet.add(it.material_code);
    }
    const itemsPayload = Array.from(merged.entries()).map(([material_code, planned_qty]) => ({
      plan_id: plan.id,
      material_code,
      planned_qty,
    }));
    itemCount += itemsPayload.length;
    const { error: itemErr } = await supabase.from("dispatch_plan_items").insert(itemsPayload);
    if (itemErr) {
      return { result: null, error: itemErr.message };
    }
  }

  return {
    result: {
      plansCreated: planCodes.length,
      planCodes,
      wdsImpacted: wdSet.size,
      materialsImported: matSet.size,
    },
    error: null,
  };
}
