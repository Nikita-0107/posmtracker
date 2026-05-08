import { useCallback, useEffect, useState } from "react";
import { useAuth, type WspCode } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";

export const ALL_WSPS: WspCode[] = ["CEVL", "CEVJ", "CEVY"];
const STORAGE_KEY = "superadmin.activeWsp";

/**
 * Returns the WSP context the UI should use for filtering / display.
 *
 * - Regular users: their assigned `profile.wsp`.
 * - Super Admins: a temporary, locally-stored choice (defaults to the first
 *   WSP). They retain access to all WSPs at all times — this only changes
 *   what they're currently looking at.
 */
export function useEffectiveWsp() {
  const { profile } = useAuth();
  const { isSuperAdmin } = useRoles();

  const [override, setOverride] = useState<WspCode | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return (ALL_WSPS as string[]).includes(v ?? "") ? (v as WspCode) : null;
  });

  // Initialize default for super admins on first load.
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (override) return;
    setOverride(ALL_WSPS[0]);
  }, [isSuperAdmin, override]);

  const setWsp = useCallback((w: WspCode) => {
    setOverride(w);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, w);
    }
  }, []);

  const wsp: WspCode | null = isSuperAdmin
    ? override ?? ALL_WSPS[0]
    : profile?.wsp ?? null;

  return { wsp, setWsp, isSuperAdmin, options: ALL_WSPS };
}
