import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { WspCode } from "@/hooks/use-auth";

export type DispatchItemStatus = "pending" | "received" | "issue";

export type InTransitMovement = {
  id: string;
  created_at: string;
  dispatch_id: string | null;
  dispatch_date: string | null;
  wsp: string;
  distributor: string | null;
  material_code: string;
  qty: number;
  item_status: DispatchItemStatus;
  proof_image_path: string | null;
  issue_note: string | null;
  parent_movement_id: string | null;
};

/**
 * Loads dispatch line items destined for the current WD user.
 * Admins see all dispatches.
 */
export function useDispatchesForWd(filter: "in_transit" | "received" | "all" = "all") {
  const { profile } = useAuth();
  const wdCode = profile?.wd_code ?? null;
  const [rows, setRows] = useState<InTransitMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const select =
      "id, created_at, dispatch_id, dispatch_date, wsp, distributor, material_code, qty, item_status, proof_image_path, issue_note, parent_movement_id";

    if (filter === "in_transit") {
      // Step 1: find every dispatch_id that still has at least one pending or issue line.
      const { data: openLines, error: openErr } = await supabase
        .from("stock_movements")
        .select("dispatch_id")
        .eq("movement", "dispatch")
        .in("item_status", ["pending", "issue"]);
      if (openErr) {
        console.error("Failed to load in-transit dispatches", openErr);
        setRows([]);
        setLoading(false);
        return;
      }
      const ids = Array.from(
        new Set((openLines ?? []).map((r) => r.dispatch_id).filter((x): x is string => !!x)),
      );
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      // Step 2: pull ALL rows for those dispatches so received parents + issue siblings render together.
      const { data, error } = await supabase
        .from("stock_movements")
        .select(select)
        .eq("movement", "dispatch")
        .in("dispatch_id", ids)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to load dispatches", error);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as InTransitMovement[]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("stock_movements")
      .select(select)
      .eq("movement", "dispatch")
      .order("created_at", { ascending: false });
    if (filter === "received") query = query.eq("item_status", "received");

    const { data, error } = await query;
    if (error) {
      console.error("Failed to load dispatches", error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as InTransitMovement[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, refresh, wdCode };
}

export async function confirmDispatchItem(
  movementId: string,
  action: "received" | "issue" | "partial",
  note?: string,
  receivedQty?: number,
) {
  const { data, error } = await supabase.rpc("confirm_dispatch_item", {
    _movement_id: movementId,
    _action: action,
    _note: note ?? undefined,
    _received_qty: receivedQty ?? undefined,
  });
  return { newStatus: data as DispatchItemStatus | null, error };
}

export type WdStockRow = { material_code: string; qty: number };

export function useWdStock() {
  const { profile } = useAuth();
  const wdCode = profile?.wd_code ?? null;
  const [stock, setStock] = useState<WdStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("wd_stock").select("material_code, qty, wd_code");
    if (wdCode) query = query.eq("wd_code", wdCode);
    const { data, error } = await query;
    if (error) {
      console.error("Failed to load WD stock", error);
      setStock([]);
      setLoading(false);
      return;
    }
    setStock(((data ?? []) as { material_code: string; qty: number }[]).map((r) => ({
      material_code: r.material_code,
      qty: r.qty,
    })));
    setLoading(false);
  }, [wdCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stock, loading, refresh, wdCode };
}

export type WdAssignment = { id: string; wd_code: string; wsp: WspCode };

export function useWdAssignments(wdCode?: string | null) {
  const [assignments, setAssignments] = useState<WdAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("wd_assignments").select("id, wd_code, wsp");
    if (wdCode) query = query.eq("wd_code", wdCode);
    const { data, error } = await query;
    if (error) {
      console.error("Failed to load assignments", error);
      setAssignments([]);
      setLoading(false);
      return;
    }
    setAssignments((data ?? []) as WdAssignment[]);
    setLoading(false);
  }, [wdCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { assignments, loading, refresh };
}
