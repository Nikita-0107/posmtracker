import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";

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

/**
 * Lightweight count of open issues (item_status = 'issue') visible to the
 * current user via RLS. Auto-refreshes when the window regains focus and on
 * any dispatch realtime change.
 */
export function useOpenIssuesCount() {
  const { user } = useAuth();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { count: c, error } = await supabase
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("movement", "dispatch")
      .eq("item_status", "issue");
    if (error) {
      console.error("Failed to load open issue count", error);
      setCount(0);
    } else {
      setCount(c ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel(`wsp-open-issues-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  return { count, loading, refresh };
}
