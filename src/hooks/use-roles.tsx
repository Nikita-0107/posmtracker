import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "wsp_admin" | "wd_admin" | "wsp" | "wd" | "tl";

export function useRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [aeWds, setAeWds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (userId: string) => {
    const [rolesRes, aeRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("ae_assignments").select("wd_code").eq("ae_user_id", userId),
    ]);
    const r = ((rolesRes.data ?? []) as { role: AppRole }[]).map((x) => x.role);
    const w = ((aeRes.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
    return { r, w };
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
    fetchAll(user.id).then(({ r, w }) => {
      if (!alive) return;
      setRoles(r);
      setAeWds(w);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [user, fetchAll]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { r, w } = await fetchAll(user.id);
    setRoles(r);
    setAeWds(w);
    setLoading(false);
  }, [user, fetchAll]);

  const has = (x: AppRole) => roles.includes(x);
  // Backward-compat: treat *_admin as also having the base role for legacy gating.
  const isWspLike = has("wsp") || has("wsp_admin");
  const isWdLike = has("wd") || has("wd_admin");
  return {
    roles,
    aeWds,
    loading,
    refresh,
    isAdmin: has("admin"),
    isSuperAdmin: has("admin"),
    isWspAdmin: has("wsp_admin"),
    isWdAdmin: has("wd_admin"),
    isWsp: isWspLike,
    isWd: isWdLike,
    isTl: has("tl"),
    isAe: has("wd_admin") && (aeWds.length > 0),
  };
}
