import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "wsp" | "wd" | "tl";

export function useRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
  }, []);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchRoles(user.id).then((next) => {
      if (!alive) return;
      setRoles(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [user, fetchRoles]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const next = await fetchRoles(user.id);
    setRoles(next);
    setLoading(false);
  }, [user, fetchRoles]);

  const has = (r: AppRole) => roles.includes(r);
  return {
    roles,
    loading,
    refresh,
    isAdmin: has("admin"),
    isWsp: has("wsp"),
    isWd: has("wd"),
    isTl: has("tl"),
  };
}
