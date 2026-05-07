import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type TlOption = {
  id: string; // wd_tls.id
  tl_name: string;
  wd_code: string;
  tl_type: string | null;
  legacy_tl_id: number | null;
};

/** WD-side: list of TLs from wd_tls reference table, filtered by current user's wd_code (via RLS). */
export function useTlsForMyWd(wdCodeOverride?: string | null) {
  const { profile } = useAuth();
  const wd = wdCodeOverride ?? profile?.wd_code ?? null;
  const [tls, setTls] = useState<TlOption[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("wd_tls")
      .select("id, tl_name, wd_code, tl_type, legacy_tl_id");
    if (wd) q = q.eq("wd_code", wd);
    const { data, error } = await q;
    if (error) {
      console.error("Failed to load TLs", error);
      setTls([]);
      setLoading(false);
      return;
    }
    setTls(
      ((data ?? []) as TlOption[])
        .slice()
        .sort((a, b) => a.tl_name.localeCompare(b.tl_name)),
    );
    setLoading(false);
  }, [wd]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tls, loading, refresh };
}

export type TlIssuanceLine = {
  id: string;
  issuance_id: string;
  material_code: string;
  qty_issued: number;
  qty_used: number;
  remaining: number;
  issue_date: string;
  wd_code: string;
};

/** TL-side (legacy app-user TL): open issuance items where remaining > 0. */
export function useOpenIssuancesForTl() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<TlIssuanceLine[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: issRows, error: iErr } = await supabase
      .from("tl_issuances")
      .select("id, wd_code, issue_date, tl_user_id")
      .eq("tl_user_id", userId)
      .order("issue_date", { ascending: false });
    if (iErr) {
      console.error("Failed to load issuances", iErr);
      setItems([]);
      setLoading(false);
      return;
    }
    const issuanceIds = (issRows ?? []).map((r) => r.id);
    if (issuanceIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data: lineRows, error: lErr } = await supabase
      .from("tl_issuance_items")
      .select("id, issuance_id, material_code, qty_issued, qty_used")
      .in("issuance_id", issuanceIds);
    if (lErr) {
      console.error("Failed to load issuance items", lErr);
      setItems([]);
      setLoading(false);
      return;
    }
    const issById = new Map(
      (issRows ?? []).map((r) => [r.id, { wd_code: r.wd_code, issue_date: r.issue_date }]),
    );
    const merged: TlIssuanceLine[] = (lineRows ?? []).map((l) => {
      const head = issById.get(l.issuance_id);
      return {
        id: l.id,
        issuance_id: l.issuance_id,
        material_code: l.material_code,
        qty_issued: l.qty_issued,
        qty_used: l.qty_used,
        remaining: l.qty_issued - l.qty_used,
        issue_date: head?.issue_date ?? "",
        wd_code: head?.wd_code ?? "",
      };
    });
    setItems(merged);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, refresh };
}

export async function issueToTl(
  wdTlId: string,
  issueDate: string,
  items: { material_code: string; qty: number }[],
) {
  const { data, error } = await supabase.rpc("issue_to_tl_v2", {
    _wd_tl_id: wdTlId,
    _issue_date: issueDate,
    _items: items,
  });
  return { issuanceId: data as string | null, error };
}

export async function recordTlUpload(
  issuanceItemId: string,
  qty: number,
  proofImagePath: string,
) {
  const { data, error } = await supabase.rpc("record_tl_upload", {
    _issuance_item_id: issuanceItemId,
    _qty: qty,
    _proof_image_path: proofImagePath,
  });
  return { remaining: data as number | null, error };
}

export type WdIssuanceHistoryItem = {
  issuance_id: string;
  issue_date: string;
  created_at: string;
  wd_tl_id: string | null;
  tl_name: string;
  tl_type: string | null;
  material_code: string;
  qty_issued: number;
};

/** WD-side: full history of issuances for the current WD. */
export function useWdIssuanceHistory(wdCodeOverride?: string | null) {
  const { profile } = useAuth();
  const wd = wdCodeOverride ?? profile?.wd_code ?? null;
  const [items, setItems] = useState<WdIssuanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("tl_issuances")
      .select("id, wd_code, issue_date, created_at, wd_tl_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (wd) q = q.eq("wd_code", wd);
    const { data: issRows, error: iErr } = await q;
    if (iErr) {
      console.error("Failed to load WD issuance history", iErr);
      setItems([]);
      setLoading(false);
      return;
    }
    const issuanceIds = (issRows ?? []).map((r) => r.id);
    const tlIds = Array.from(
      new Set(
        (issRows ?? [])
          .map((r) => r.wd_tl_id)
          .filter((v): v is string => !!v),
      ),
    );
    if (issuanceIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const [{ data: lineRows, error: lErr }, { data: tlRows, error: pErr }] =
      await Promise.all([
        supabase
          .from("tl_issuance_items")
          .select("issuance_id, material_code, qty_issued")
          .in("issuance_id", issuanceIds),
        tlIds.length > 0
          ? supabase
              .from("wd_tls")
              .select("id, tl_name, tl_type")
              .in("id", tlIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);
    if (lErr || pErr) {
      console.error("Failed to load issuance lines/tls", lErr || pErr);
      setItems([]);
      setLoading(false);
      return;
    }
    const tlById = new Map(
      (tlRows ?? []).map((p) => [
        p.id,
        { name: p.tl_name, tl_type: p.tl_type as string | null },
      ]),
    );
    const issById = new Map(
      (issRows ?? []).map((r) => [
        r.id,
        {
          issue_date: r.issue_date,
          created_at: r.created_at,
          wd_tl_id: r.wd_tl_id as string | null,
        },
      ]),
    );
    const merged: WdIssuanceHistoryItem[] = (lineRows ?? []).map((l) => {
      const head = issById.get(l.issuance_id)!;
      const tl = head.wd_tl_id ? tlById.get(head.wd_tl_id) : undefined;
      return {
        issuance_id: l.issuance_id,
        issue_date: head.issue_date,
        created_at: head.created_at,
        wd_tl_id: head.wd_tl_id,
        tl_name: tl?.name ?? "—",
        tl_type: tl?.tl_type ?? null,
        material_code: l.material_code,
        qty_issued: l.qty_issued,
      };
    });
    setItems(merged);
    setLoading(false);
  }, [wd]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, refresh };
}
