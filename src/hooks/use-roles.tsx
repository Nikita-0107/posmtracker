import { useCallback } from "react";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export type { AppRole };

export function useRoles() {
  const { profile, rolesBundle, rolesLoading, refreshProfile } = useAuth();
  const roles = rolesBundle?.roles ?? [];
  const aeWds = rolesBundle?.aeWds ?? [];
  const tlReceiverWd = rolesBundle?.tlReceiverWd ?? null;

  const refresh = useCallback(async () => {
    await refreshProfile?.();
  }, [refreshProfile]);

  const has = (x: AppRole) => roles.includes(x);
  return {
    roles,
    aeWds,
    loading: rolesLoading,
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
    tlReceiverWd,
    isTlWdReceiver: !!tlReceiverWd,
  };
}
