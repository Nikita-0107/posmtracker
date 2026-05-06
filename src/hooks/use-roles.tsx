import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "wsp_admin" | "wd_admin" | "wsp" | "wd" | "tl";

export type TlRecord = { id: string; wd_code: string | null; legacy_tl_id: number | null };

export function useRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [aeWds, setAeWds] = useState<string[]>([]);
  const [tlRecord, setTlRecord] = useState<TlRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (userId: string) => {
    const [rolesRes, aeRes, tlRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("ae_assignments").select("wd_code").eq("ae_user_id", userId),
      supabase.from("wd_tls").select("id, wd_code, legacy_tl_id").eq("user_id", userId).maybeSingle(),
    ]);
    const r = ((rolesRes.data ?? []) as { role: AppRole }[]).map((x) => x.role);
    const w = ((aeRes.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
    const tl = (tlRes.data ?? null) as TlRecord | null;
    return { r, w, tl };
  }, []);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setAeWds([]);
      setTlRecord(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchAll(user.id).then(({ r, w, tl }) => {
      if (!alive) return;
      setRoles(r);
      setAeWds(w);
      setTlRecord(tl);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user, fetchAll]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { r, w, tl } = await fetchAll(user.id);
    setRoles(r);
    setAeWds(w);
    setTlRecord(tl);
    setLoading(false);
  }, [user, fetchAll]);

  const has = (x: AppRole) => roles.includes(x);
  const isWspLike = has("wsp") || has("wsp_admin");
  const isWdLike = has("wd") || has("wd_admin");
  const isTl = has("tl");
  const tlNeedsSetup = isTl && !tlRecord;
  const tlPendingWd = isTl && !!tlRecord && !tlRecord.wd_code;
  return {
    roles,
    aeWds,
    tlRecord,
    tlNeedsSetup,
    tlPendingWd,
    loading,
    refresh,
    isAdmin: has("admin"),
    isSuperAdmin: has("admin"),
    isWspAdmin: has("wsp_admin"),
    isWdAdmin: has("wd_admin"),
    isWsp: isWspLike,
    isWd: isWdLike,
    isTl,
    isAe: has("wd_admin") && (aeWds.length > 0),
  };
}
