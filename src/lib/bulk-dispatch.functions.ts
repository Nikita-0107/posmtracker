import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WspCode } from "@/hooks/use-auth";

const VALID_WSPS: WspCode[] = ["CEVL", "CEVJ", "CEVY"];

export type BulkDispatchReferenceData = {
  allowedWsps: WspCode[];
  assignments: Array<{ wd_code: string; wsp: WspCode }>;
  materials: string[];
};

export const getBulkDispatchReferenceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BulkDispatchReferenceData> => {
    const [{ data: rolesData, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("profiles").select("wsp").eq("id", context.userId).maybeSingle(),
    ]);
    if (rolesError) throw new Error(rolesError.message);
    if (profileError) throw new Error(profileError.message);

    const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roles.includes("admin");
    const isWspAdmin = roles.includes("wsp_admin");
    if (!isAdmin && !isWspAdmin) throw new Error("Forbidden");

    const allowedWsps = isAdmin
      ? VALID_WSPS
      : profile?.wsp && VALID_WSPS.includes(profile.wsp as WspCode)
        ? [profile.wsp as WspCode]
        : [];
    if (allowedWsps.length === 0) throw new Error("No WSP assigned to this user");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [assignRes, matRes] = await Promise.all([
      supabaseAdmin
        .from("wd_assignments")
        .select("wd_code, wsp")
        .in("wsp", allowedWsps),
      supabaseAdmin.from("materials").select("code"),
    ]);
    if (assignRes.error) throw new Error(assignRes.error.message);
    if (matRes.error) throw new Error(matRes.error.message);

    return {
      allowedWsps,
      assignments: ((assignRes.data ?? []) as Array<{ wd_code: string; wsp: WspCode }>).map((a) => ({
        wd_code: a.wd_code.toUpperCase(),
        wsp: a.wsp,
      })),
      materials: ((matRes.data ?? []) as Array<{ code: string }>).map((m) => m.code),
    };
  });