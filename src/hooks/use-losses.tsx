import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type LossRow = {
  id: string;
  created_at: string;
  dispatch_id: string | null;
  dispatch_date: string | null;
  distributor: string | null;
  material_code: string;
  qty: number;
  issue_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  wsp: string;
};

export type LossFilters = {
  wd?: string | null;
  material?: string | null;
  /** Limit to losses resolved within the last N days. null = all time. */
  sinceDays?: number | null;
};

/**
 * Loads dispatch lines closed as a permanent loss (item_status='closed_loss').
 * RLS already restricts results to the user's WSP (admins see all).
 */
export function useLosses(filters: LossFilters = {}) {
  const { user } = useAuth();
  const { wd = null, material = null, sinceDays = null } = filters;
  const [rows, setRows] = useState<LossRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("stock_movements")
      .select(
        "id, created_at, dispatch_id, dispatch_date, distributor, material_code, qty, issue_note, resolved_at, resolved_by, wsp",
      )
      .eq("movement", "dispatch")
      .eq("item_status", "closed_loss")
      .order("resolved_at", { ascending: false })
      .limit(500);

    if (wd) query = query.eq("distributor", wd);
    if (material) query = query.eq("material_code", material);
    if (sinceDays && sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("resolved_at", since);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Failed to load losses", error);
      setRows([]);
    } else {
      setRows((data ?? []) as LossRow[]);
    }
    setLoading(false);
  }, [wd, material, sinceDays]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel(`wsp-losses-${user.id}`)
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

  const totals = useMemo(() => {
    const totalQty = rows.reduce((sum, r) => sum + (r.qty ?? 0), 0);
    return { totalQty, count: rows.length };
  }, [rows]);

  return { rows, loading, refresh, totals };
}

/**
 * Lightweight summary of all-time losses for the current user (RLS scoped).
 * Returns total quantity lost and number of loss events.
 */
export function useLossesSummary() {
  const { user } = useAuth();
  const [totalQty, setTotalQty] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error, count: c } = await supabase
      .from("stock_movements")
      .select("qty", { count: "exact" })
      .eq("movement", "dispatch")
      .eq("item_status", "closed_loss");
    if (error) {
      console.error("Failed to load losses summary", error);
      setTotalQty(0);
      setCount(0);
    } else {
      const sum = (data ?? []).reduce((s, r: { qty: number }) => s + (r.qty ?? 0), 0);
      setTotalQty(sum);
      setCount(c ?? (data?.length ?? 0));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setTotalQty(0);
      setCount(0);
      setLoading(false);
      return;
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel(`wsp-losses-summary-${user.id}`)
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

  return { totalQty, count, loading, refresh };
}
