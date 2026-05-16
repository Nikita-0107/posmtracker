import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "wsp_admin" | "wd_admin" | "wsp" | "wd" | "tl";

export function useRoles() {
  const { user, profile } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [aeWds, setAeWds] = useState<string[]>([]);
  const [tlReceiverWd, setTlReceiverWd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (userId: string, aeId: string | null, tlId: string | null) => {
    const rolesRes = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const r = ((rolesRes.data ?? []) as { role: AppRole }[]).map((x) => x.role);

    let w: string[] = [];
    if (aeId) {
      const h = await supabase.from("hierarchy_wd").select("wd_code").eq("ae_id", aeId);
      w = ((h.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
    }
    if (w.length === 0) {
      // legacy fallback
      const aeRes = await supabase.from("ae_assignments").select("wd_code").eq("ae_user_id", userId);
      w = ((aeRes.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
    }

    // If TL, check whether this TL is the designated WD receiver.
    let receiverWd: string | null = null;
    if (tlId) {
      const { data } = await supabase
        .from("hierarchy_tl")
        .select("wd_code, is_wd_receiver, active")
        .eq("tl_id", tlId)
        .maybeSingle();
      const row = data as { wd_code: string; is_wd_receiver: boolean; active: boolean } | null;
      if (row?.is_wd_receiver && row.active) receiverWd = row.wd_code;
    }
    return { r, w, receiverWd };
  }, []);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setAeWds([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchAll(user.id, profile?.ae_id ?? null).then(({ r, w }) => {
      if (!alive) return;
      setRoles(r);
      setAeWds(w);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user, profile?.ae_id, fetchAll]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { r, w } = await fetchAll(user.id, profile?.ae_id ?? null);
    setRoles(r);
    setAeWds(w);
    setLoading(false);
  }, [user, profile?.ae_id, fetchAll]);

  const has = (x: AppRole) => roles.includes(x);
  return {
    roles,
    aeWds,
    loading,
    refresh,
    isAdmin: has("admin"),
    isSuperAdmin: has("admin"),
    isWspAdmin: has("wsp_admin"),
    isWdAdmin: has("wd_admin"),
    isWsp: has("wsp") || has("wsp_admin"),
    isWd: has("wd") || has("wd_admin"),
    isTl: has("tl"),
    isAe: has("wd_admin"),
    aeId: profile?.ae_id ?? null,
    tlId: profile?.tl_id ?? null,
  };
}
