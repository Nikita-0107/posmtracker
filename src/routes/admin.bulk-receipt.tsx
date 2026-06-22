import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  ChartNoAxesCombined,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/use-roles";
import {
  parseReceiptPlanXlsx,
  type ParseResult,
} from "@/lib/parse-receipt-plan-xlsx";
import { uploadReceiptPlan } from "@/lib/receipt-plan.functions";

const VALID_WSPS = ["CEVL", "CEVJ", "CEVY"] as const;
type WspCode = (typeof VALID_WSPS)[number];

export const Route = createFileRoute("/admin/bulk-receipt")({
  component: BulkReceiptPage,
  head: () => ({ meta: [{ title: "Bulk Receipt Upload — POSM Tracker" }] }),
});

function BulkReceiptPage() {
  const { isSuperAdmin, isAdmin } = useRoles();
  const canUse = isSuperAdmin || isAdmin;
  const upload = useServerFn(uploadReceiptPlan);

  const [wsp, setWsp] = useState<WspCode>("CEVL");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ planCode: string; itemsCreated: number; materialsCreated: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setParsed(null);
    setResult(null);
    setSubmitError(null);
    setParsing(true);
    try {
      const res = await parseReceiptPlanXlsx(f);
      setParsed(res);
    } catch (err) {
      setParsed({ rows: [], errors: [{ row: 0, message: (err as Error).message }] });
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!parsed || parsed.rows.length === 0 || parsed.errors.length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await upload({
        data: {
          wsp,
          rows: parsed.rows.map((row) => ({
            material_code: row.material_code,
            material_description: row.material_description,
            qty: row.qty,
          })),
        },
      });
      setResult(r);
      setParsed(null);
      setFileName(null);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Material Code", "Material Description", "Quantity"],
      ["M/0127401101", "Sample Counter Top", 50],
      ["M/NEW000001", "Brand New Material Sample", 25],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ReceiptPlan");
    XLSX.writeFile(wb, "receipt-plan-template.xlsx");
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <FileSpreadsheet size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold leading-tight">Bulk Receipt Upload</h2>
              <p className="text-[11px] text-muted-foreground">
                Plan material receipts for a WSP. They'll confirm with proof images.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/bulk-receipt-tracker">
              <ChartNoAxesCombined /> Tracker
            </Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/10"
        >
          <Download size={14} /> Download Excel template
        </button>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Target WSP</span>
          <select
            value={wsp}
            onChange={(e) => setWsp(e.target.value as WspCode)}
            className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-medium"
          >
            {VALID_WSPS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

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
            <Loader2 size={14} className="animate-spin" /> Parsing…
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
              <div className="max-h-64 overflow-y-auto rounded-lg border bg-card text-[11px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/60 font-bold">
                    <tr>
                      <th className="px-2 py-1 text-left">Code</th>
                      <th className="px-2 py-1 text-left">Description</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <tr key={r.material_code} className="border-t">
                        <td className="px-2 py-1 font-mono">{r.material_code}</td>
                        <td className="px-2 py-1">{r.material_description}</td>
                        <td className="px-2 py-1 text-right font-bold">{r.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="rounded-lg bg-accent/10 px-2 py-1.5 text-[11px] text-accent-foreground">
              <Sparkles size={11} className="mr-1 inline" />
              New material codes will be auto-created on submit.
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || parsed.rows.length === 0 || parsed.errors.length > 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {submitting ? "Creating plan…" : `Create plan for ${wsp}`}
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
              <CheckCircle2 size={18} /> Plan created
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Plan" value={result.planCode} mono />
              <Stat label="Items" value={String(result.itemsCreated)} />
              <Stat label="New mats" value={String(result.materialsCreated)} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-card p-2">
      <p className={`text-sm font-bold text-success ${mono ? "font-mono" : ""}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
