import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WspIssueRow = {
  id: string;
  created_at: string;
  dispatch_id: string | null;
  dispatch_date: string | null;
  distributor: string | null;
  material_code: string;
  qty: number;
  issue_note: string | null;
  confirmed_at: string | null;
  item_status: string;
};

/**
 * Loads dispatch lines that the WD has marked as "issue" so the WSP
 * (or admin) can act on them. RLS already restricts to the user's own WSP.
 */
export function useWspIssues() {
  const [rows, setRows] = useState<WspIssueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, created_at, dispatch_id, dispatch_date, distributor, material_code, qty, issue_note, confirmed_at, item_status",
      )
      .eq("movement", "dispatch")
      .eq("item_status", "issue")
      .order("confirmed_at", { ascending: false });
    if (error) {
      console.error("Failed to load WSP issues", error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as WspIssueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}

export type ResolveAction = "accept_loss" | "redispatch" | "keep_pending";

export async function resolveDispatchIssue(
  movementId: string,
  action: ResolveAction,
  redispatchQty?: number,
) {
  const { data, error } = await supabase.rpc("resolve_dispatch_issue", {
    _movement_id: movementId,
    _action: action,
    _redispatch_qty: redispatchQty ?? undefined,
  });
  return { newStatus: data as string | null, error };
}
