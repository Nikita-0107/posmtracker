import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Download, Trash2, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useRoles } from "@/hooks/use-roles";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  parseDispatchPlanXlsx,
  type ParseResult,
} from "@/lib/parse-dispatch-plan-xlsx";
import { createBulkPlans, cancelPlan, type BulkPlanResult } from "@/hooks/use-dispatch-plans";
import type { WspCode } from "@/hooks/use-auth";

type PendingPlanRow = {
  id: string;
  plan_code: string;
  wsp: WspCode;
  wd_code: string;
  plan_date: string;
  created_at: string;
  items_count: number;
  total_qty: number;
};

export const Route = createFileRoute("/admin/bulk-dispatch")({
  component: BulkDispatchUploadPage,
  head: () => ({
    meta: [{ title: "Bulk Dispatch Upload — POSM Tracker" }],
  }),
});

function BulkDispatchUploadPage() {
  const { isSuperAdmin, isWspAdmin } = useRoles();
  const { profile } = useAuth();
  const canUse = isSuperAdmin || isWspAdmin;
  const allowedWsps: WspCode[] | "all" = isSuperAdmin
    ? "all"
    : profile?.wsp
      ? [profile.wsp as WspCode]
      : [];

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkPlanResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setParsed(null);
    setResult(null);
    setSubmitError(null);
    setParsing(true);
    const res = await parseDispatchPlanXlsx(f, { allowedWsps });
    setParsed(res);
    setParsing(false);
  }

  // ----- Pending (removable) plans -----
  const [pending, setPending] = useState<PendingPlanRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    if (!canUse) return;
    setPendingLoading(true);
    let q = supabase
      .from("dispatch_plans")
      .select("id, plan_code, wsp, wd_code, plan_date, created_at, dispatch_plan_items(planned_qty)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!isSuperAdmin && profile?.wsp) q = q.eq("wsp", profile.wsp);
    const { data, error } = await q;
    if (error) {
      setPending([]);
      setPendingLoading(false);
      return;
    }
    type Row = {
      id: string; plan_code: string; wsp: WspCode; wd_code: string;
      plan_date: string; created_at: string;
      dispatch_plan_items: { planned_qty: number }[] | null;
    };
    setPending(
      ((data ?? []) as Row[]).map((p) => ({
        id: p.id,
        plan_code: p.plan_code,
        wsp: p.wsp,
        wd_code: p.wd_code,
        plan_date: p.plan_date,
        created_at: p.created_at,
        items_count: p.dispatch_plan_items?.length ?? 0,
        total_qty: (p.dispatch_plan_items ?? []).reduce((s, it) => s + (it.planned_qty ?? 0), 0),
      })),
    );
    setPendingLoading(false);
  }, [canUse, isSuperAdmin, profile?.wsp]);

  useEffect(() => { void refreshPending(); }, [refreshPending]);

  async function handleCancel(plan: PendingPlanRow) {
    if (!confirm(`Remove plan ${plan.plan_code} (${plan.wd_code})? This cannot be undone.`)) return;
    setCancellingId(plan.id);
    setCancelError(null);
    const { error } = await cancelPlan(plan.id);
    setCancellingId(null);
    if (error) {
      setCancelError(error.message);
      return;
    }
    await refreshPending();
  }

  async function handleSubmit() {
    if (!parsed || parsed.rows.length === 0 || parsed.errors.length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const { result: r, error } = await createBulkPlans(parsed.rows);
    setSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }
    setResult(r);
    setParsed(null);
    setFileName(null);
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["WSP", "WD Code", "Material Code", "Quantity"],
      ["CEVJ", "VI3221", "M/0127401101", 100],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DispatchPlans");
    XLSX.writeFile(wb, "dispatch-plan-template.xlsx");
  }

  if (!canUse) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md pt-8 text-center text-sm text-muted-foreground">
          You don't have access to this page.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4 pb-8">
        <AdminTabs />
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileSpreadsheet size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">Bulk Dispatch Upload</h2>
            <p className="text-[11px] text-muted-foreground">
              Upload Excel to pre-plan dispatches. No stock is moved until WSP user executes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/10"
        >
          <Download size={14} /> Download Excel template
        </button>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">Excel file</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border-2 border-dashed bg-card p-3">
            <Upload size={18} className="text-muted-foreground" />
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="flex-1 text-xs"
            />
          </div>
          {fileName && (
            <p className="mt-1 text-[11px] text-muted-foreground">Selected: {fileName}</p>
          )}
        </label>

        {parsing && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Parsing & validating…
          </p>
        )}

        {parsed && (
          <section className="space-y-2">
            <div className="rounded-lg border bg-card p-3 text-xs">
              <p>
                <strong>{parsed.rows.length}</strong> valid rows ·{" "}
                <strong className={parsed.errors.length ? "text-destructive" : ""}>
                  {parsed.errors.length}
                </strong>{" "}
                errors
              </p>
            </div>
            {parsed.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                {parsed.errors.map((e, i) => (
                  <p key={i} className="flex items-start gap-1 py-0.5 text-[11px] text-destructive">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    <span>
                      <strong>Row {e.row}:</strong> {e.message}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {parsed.rows.length > 0 && parsed.errors.length === 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-card text-[11px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/60 font-bold">
                    <tr>
                      <th className="px-2 py-1 text-left">WSP</th>
                      <th className="px-2 py-1 text-left">WD</th>
                      <th className="px-2 py-1 text-left">Material</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <tr key={r.row} className="border-t">
                        <td className="px-2 py-1 font-mono">{r.wsp}</td>
                        <td className="px-2 py-1 font-mono">{r.wd_code}</td>
                        <td className="px-2 py-1 font-mono">{r.material_code}</td>
                        <td className="px-2 py-1 text-right font-bold">{r.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting || parsed.rows.length === 0 || parsed.errors.length > 0
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {submitting ? "Creating plans…" : `Create ${parsed.rows.length} plan rows`}
            </button>
            {submitError && (
              <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive">
                {submitError}
              </p>
            )}
          </section>
        )}

        {result && (
          <section className="space-y-2 rounded-xl border-2 border-success/30 bg-success/5 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-success">
              <CheckCircle2 size={18} /> Upload successful
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Plans" value={result.plansCreated} />
              <Stat label="WDs" value={result.wdsImpacted} />
              <Stat label="Materials" value={result.materialsImported} />
            </div>
            <div className="rounded-lg bg-card p-2 text-[11px]">
              <p className="font-bold text-foreground">Plan codes:</p>
              <p className="break-words font-mono text-muted-foreground">
                {result.planCodes.join(", ")}
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-card p-2">
      <p className="font-mono text-lg font-bold text-success">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
