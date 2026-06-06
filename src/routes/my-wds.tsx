import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Loader2, Users, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { exportConsolidatedWdReport } from "@/lib/export-consolidated-wd-report";
import { toast } from "sonner";

export const Route = createFileRoute("/my-wds")({
  component: MyWdsPage,
  head: () => ({
    meta: [{ title: "My WDs — POSM Tracker" }],
  }),
});

type WdRow = { wd_code: string; wd_name: string };

function MyWdsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { aeId, isAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [wds, setWds] = useState<WdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  async function handleConsolidatedExport() {
    if (!aeId) {
      toast.error("No AE ID on your profile");
      return;
    }
    setExporting(true);
    try {
      const res = await exportConsolidatedWdReport({
        aeId,
        aeName: profile?.display_name ?? "",
      });
      toast.success(
        `Exported ${res.totalWds} WDs · ${res.totalMaterials} materials · ${res.totalStockUnits} units`,
        { description: res.filename },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast.error("Export failed", { description: msg });
    } finally {
      setExporting(false);
    }
  }

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

        {aeId && !isAdmin && (
          <section className="space-y-1.5">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Reports
            </h2>
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <FileSpreadsheet size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">Consolidated WD Report</p>
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                      Excel
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Stock across all {wds.length > 0 ? wds.length : "your"} mapped WD{wds.length === 1 ? "" : "s"} in a single file — with totals, filters & TL details.
                  </p>
                  <button
                    onClick={handleConsolidatedExport}
                    disabled={exporting || wds.length === 0}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {exporting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Preparing…
                      </>
                    ) : (
                      <>
                        <Download size={13} /> Download Report
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <p className="px-1 text-[10px] text-muted-foreground">
              For a single WD, open any WD below to download its individual report.
            </p>
          </section>
        )}

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
