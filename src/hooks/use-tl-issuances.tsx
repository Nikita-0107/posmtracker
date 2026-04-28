import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type TlOption = {
  id: string;
  mobile: string;
  display_name: string | null;
  wd_code: string | null;
  tl_type: string | null;
};

/** WD-side: list of TLs linked to the current WD (or all TLs for admin). */
export function useTlsForMyWd() {
  const { profile } = useAuth();
  const wd = profile?.wd_code ?? null;
  const [tls, setTls] = useState<TlOption[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Get user_ids that have the 'tl' role
    const { data: roleRows, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "tl");
    if (rErr) {
      console.error("Failed to load TL roles", rErr);
      setTls([]);
      setLoading(false);
      return;
    }
    const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    if (ids.length === 0) {
      setTls([]);
      setLoading(false);
      return;
    }
    let q = supabase
      .from("profiles")
      .select("id, mobile, display_name, wd_code, tl_type")
      .in("id", ids);
    if (wd) q = q.eq("wd_code", wd);
    const { data, error } = await q;
    if (error) {
      console.error("Failed to load TL profiles", error);
      setTls([]);
      setLoading(false);
      return;
    }
    setTls(((data ?? []) as TlOption[]).slice().sort((a, b) =>
      (a.display_name ?? a.mobile).localeCompare(b.display_name ?? b.mobile),
    ));
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

/** TL-side: open issuance items where remaining > 0. */
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
  tlUserId: string,
  issueDate: string,
  items: { material_code: string; qty: number }[],
) {
  const { data, error } = await supabase.rpc("issue_to_tl", {
    _tl_user_id: tlUserId,
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
