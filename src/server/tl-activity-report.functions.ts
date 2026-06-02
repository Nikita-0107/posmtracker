import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getTlActivityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: re } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (re) throw new Error(re.message);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Forbidden: Super Admin only");
    }

    const { data, error } = await supabaseAdmin.rpc("get_tl_activity_report", {
      _inactivity_days: 7,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      ae_id: string | null;
      ae_name: string | null;
      wd_code: string;
      wd_name: string | null;
      tl_id: string;
      tl_name: string;
      status: string;
      last_activity: string | null;
      current_streak: number;
    }>;
  });
