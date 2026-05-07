import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Loader2, Users, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/my-wds")({
  component: MyWdsPage,
  head: () => ({
    meta: [{ title: "My WDs — POSM Tracker" }],
  }),
});

type WdRow = { wd_code: string; wd_name: string };

function MyWdsPage() {
  const { user, loading: authLoading } = useAuth();
  const { aeId, isAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [wds, setWds] = useState<WdRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      let q = supabase.from("hierarchy_wd").select("wd_code, wd_name").order("wd_code");
      if (aeId && !isAdmin) q = q.eq("ae_id", aeId);
      const { data } = await q;
      setWds((data ?? []) as WdRow[]);
      setLoading(false);
    })();
  }, [user, authLoading, rolesLoading, aeId, isAdmin, navigate]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">My WDs</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Distributors mapped to your AE account from the master hierarchy.
        </p>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/wd-admin/users"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
          >
            <Users size={14} /> Manage TLs
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : wds.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No WDs are mapped to your AE yet. Ask an admin to import the hierarchy.
          </div>
        ) : (
          <div className="grid gap-2">
            {wds.map((w) => (
              <Link
                key={w.wd_code}
                to="/wd"
                search={{ wd: w.wd_code } as never}
                className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm transition hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="font-bold text-foreground">{w.wd_code}</div>
                  <div className="truncate text-xs text-muted-foreground">{w.wd_name}</div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
