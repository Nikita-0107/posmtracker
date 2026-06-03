import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Upload, Loader2, Package, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { importWdStock } from "@/server/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/wd-stock")({
  component: WdStockImportPage,
  head: () => ({ meta: [{ title: "WD Stock Import — POSM Tracker" }] }),
});

type Row = { wd_code: string; material_code: string; material_name: string; qty: number };
type DupErr = { wd_code: string; material_code: string; rows: number[] };
type SheetReport = {
  sheet: string;
  status: "ok" | "blank" | "invalid_wd" | "no_data";
  rows: number;
  duplicates: DupErr[];
};
type ParseResult = {
  rows: Row[];
  sheetReports: SheetReport[];
  validWdSet: Set<string>;
  invalidWds: string[];
  blankSheets: string[];
  duplicateErrors: { wd_code: string; material_code: string; rows: number[] }[];
};
type ImportResult = { stock_added: number; stock_updated: number; materials_created: number };

const HEADERS = { brand: "brand", code: "code", desc: "material description", qty: "wd soh" };

function normalize(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

function findHeaderRow(aoa: unknown[][]): { row: number; codeCol: number; descCol: number; qtyCol: number } | null {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const r = aoa[i] || [];
    const norm = r.map((c) => normalize(c));
    const codeCol = norm.indexOf(HEADERS.code);
    const descCol = norm.indexOf(HEADERS.desc);
    const qtyCol = norm.indexOf(HEADERS.qty);
    if (codeCol >= 0 && qtyCol >= 0) {
      return { row: i, codeCol, descCol, qtyCol };
    }
  }
  return null;
}

function parseWorkbook(wb: XLSX.WorkBook, validWds: Set<string>): ParseResult {
  const rows: Row[] = [];
  const sheetReports: SheetReport[] = [];
  const blankSheets: string[] = [];
  const invalidWds: string[] = [];
  const allDups: DupErr[] = [];

  for (const sheetName of wb.SheetNames) {
    const wdCode = sheetName.trim();
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });

    if (!aoa || aoa.length === 0) {
      blankSheets.push(wdCode);
      sheetReports.push({ sheet: wdCode, status: "blank", rows: 0, duplicates: [] });
      continue;
    }

    if (!validWds.has(wdCode)) {
      invalidWds.push(wdCode);
      sheetReports.push({ sheet: wdCode, status: "invalid_wd", rows: 0, duplicates: [] });
      continue;
    }

    const hdr = findHeaderRow(aoa);
    if (!hdr) {
      sheetReports.push({ sheet: wdCode, status: "no_data", rows: 0, duplicates: [] });
      continue;
    }

    const seen = new Map<string, number[]>(); // material_code -> excel row numbers
    const sheetRows: Row[] = [];
    for (let i = hdr.row + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const code = String(r[hdr.codeCol] ?? "").trim();
      const desc = hdr.descCol >= 0 ? String(r[hdr.descCol] ?? "").trim() : code;
      const qtyRaw = r[hdr.qtyCol];
      const qty = Math.floor(Number(qtyRaw));
      if (!code) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const excelRow = i + 1;
      const prior = seen.get(code);
      if (prior) {
        prior.push(excelRow);
      } else {
        seen.set(code, [excelRow]);
        sheetRows.push({ wd_code: wdCode, material_code: code, material_name: desc || code, qty });
      }
    }

    const dups: DupErr[] = [];
    for (const [code, rs] of seen) {
      if (rs.length > 1) {
        const dup = { wd_code: wdCode, material_code: code, rows: rs };
        dups.push(dup);
        allDups.push(dup);
      }
    }

    if (sheetRows.length === 0 && dups.length === 0) {
      sheetReports.push({ sheet: wdCode, status: "no_data", rows: 0, duplicates: [] });
      continue;
    }

    // Exclude duplicates from import
    const dupCodes = new Set(dups.map((d) => d.material_code));
    const cleanRows = sheetRows.filter((r) => !dupCodes.has(r.material_code));
    rows.push(...cleanRows);
    sheetReports.push({ sheet: wdCode, status: "ok", rows: cleanRows.length, duplicates: dups });
  }

  return { rows, sheetReports, validWdSet: validWds, invalidWds, blankSheets, duplicateErrors: allDups };
}

function WdStockImportPage() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();

  const [validWds, setValidWds] = useState<Set<string> | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, authLoading, rolesLoading, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from("hierarchy_wd").select("wd_code").then(({ data, error }) => {
      if (error) { toast.error("Failed to load WD list"); return; }
      setValidWds(new Set((data ?? []).map((r) => r.wd_code as string)));
    });
  }, [isSuperAdmin]);

  const summary = useMemo(() => {
    if (!parsed) return null;
    const wds = new Set(parsed.rows.map((r) => r.wd_code));
    const mats = new Set(parsed.rows.map((r) => r.material_code));
    return { wds: wds.size, materials: mats.size, rows: parsed.rows.length };
  }, [parsed]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validWds) { toast.error("WD list still loading, please retry"); return; }
    setFileName(f.name);
    setResult(null);
    setParsed(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: "array" });
        const p = parseWorkbook(wb, validWds);
        setParsed(p);
        if (p.rows.length === 0) {
          toast.warning("No valid stock rows found");
        } else {
          toast.success(`Parsed ${p.rows.length} rows across ${new Set(p.rows.map(r => r.wd_code)).size} WDs`);
        }
      } catch (err) {
        toast.error((err as Error).message);
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    setConfirming(false);
    try {
      // Chunk to stay well within payload limits (50k row hard cap server-side)
      const CHUNK = 5000;
      const totals: ImportResult = { stock_added: 0, stock_updated: 0, materials_created: 0 };
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK);
        const res = (await importWdStock({ data: { rows: chunk } })) as ImportResult;
        totals.stock_added += res.stock_added;
        totals.stock_updated += res.stock_updated;
        totals.materials_created += res.materials_created;
      }
      setResult(totals);
      toast.success("WD stock import completed");
      setParsed(null);
      setFileName("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isSuperAdmin) return <AppShell><div className="p-4 text-sm text-muted-foreground">Super Admin only.</div></AppShell>;

  const canImport = !!parsed && parsed.rows.length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4">
        <AdminTabs />
        <div className="flex items-center gap-2">
          <Package className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">WD Stock Import</h1>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold">Upload WD stock workbook</h2>
          <p className="text-xs text-muted-foreground">
            Each worksheet name must be a <b>WD Code</b>. Each sheet must contain a header row with columns: <code>Brand, Code, Material Description, WD SOH</code>.
            Blank sheets, blank material codes, and zero-quantity rows are ignored. Duplicate material codes within the same sheet are reported and skipped.
            <b className="block mt-1">This only updates WD stock — no transactions are created, no hierarchy/users are touched.</b>
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="wdstock-file"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
              <FileSpreadsheet size={14}/> Choose File
            </label>
            <input id="wdstock-file" type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={onFile} className="sr-only" />
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">
              {fileName || "No file chosen"}
            </span>
          </div>

          {!fileName && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <FileSpreadsheet size={14}/> Please select a stock workbook to continue. The Import button enables after a valid file is loaded.
            </div>
          )}
        </div>

        {parsed && summary && (
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-bold">Pre-import summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label="Sheets processed" value={parsed.sheetReports.length} />
              <Stat label="WDs detected" value={summary.wds} />
              <Stat label="Materials detected" value={summary.materials} />
              <Stat label="Rows to import" value={summary.rows} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <Stat label="Blank sheets" value={parsed.blankSheets.length} tone={parsed.blankSheets.length ? "warn" : "ok"} />
              <Stat label="Invalid WD sheets" value={parsed.invalidWds.length} tone={parsed.invalidWds.length ? "warn" : "ok"} />
              <Stat label="Duplicate material errors" value={parsed.duplicateErrors.length} tone={parsed.duplicateErrors.length ? "warn" : "ok"} />
            </div>

            {parsed.invalidWds.length > 0 && (
              <ReportBlock title="Skipped — WD code not found in system" items={parsed.invalidWds} />
            )}
            {parsed.blankSheets.length > 0 && (
              <ReportBlock title="Ignored — blank sheets" items={parsed.blankSheets} />
            )}
            {parsed.duplicateErrors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                  <AlertCircle size={14}/> Duplicate material codes (skipped from import)
                </div>
                <ul className="max-h-48 overflow-y-auto text-xs text-destructive space-y-0.5">
                  {parsed.duplicateErrors.slice(0, 200).map((d, i) => (
                    <li key={i}>{d.wd_code} — {d.material_code} (rows {d.rows.join(", ")})</li>
                  ))}
                  {parsed.duplicateErrors.length > 200 && <li>…and {parsed.duplicateErrors.length - 200} more</li>}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => setConfirming(true)} disabled={busy || !canImport}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed">
                {busy ? <Loader2 className="animate-spin" size={12}/> : <Upload size={12}/>} Import Stock
              </button>
              {!canImport && !busy && <span className="text-xs text-muted-foreground">No valid rows to import</span>}
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-400">
              <CheckCircle2 size={16}/> Import Successful
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <Stat label="Stock records added" value={result.stock_added} />
              <Stat label="Stock records updated" value={result.stock_updated} />
              <Stat label="New materials created" value={result.materials_created} />
            </div>
          </div>
        )}

        {parsed && parsed.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">WD</th>
                  <th className="p-2">Material Code</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-bold">{r.wd_code}</td>
                    <td className="p-2">{r.material_code}</td>
                    <td className="p-2 text-muted-foreground">{r.material_name}</td>
                    <td className="p-2 text-right">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 100 && <div className="p-2 text-muted-foreground">…and {parsed.rows.length - 100} more</div>}
          </div>
        )}

        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold">Confirm WD Stock Import</h3>
              <p className="text-sm text-muted-foreground">You are about to update the current stock-on-hand for:</p>
              <ul className="text-sm space-y-1">
                <li>• <b>{summary?.wds ?? 0}</b> WD{(summary?.wds ?? 0) !== 1 && "s"}</li>
                <li>• <b>{summary?.materials ?? 0}</b> distinct material{(summary?.materials ?? 0) !== 1 && "s"}</li>
                <li>• <b>{summary?.rows ?? 0}</b> stock row{(summary?.rows ?? 0) !== 1 && "s"}</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Existing stock quantities for these WD/material pairs will be <b>replaced</b> with the values in the workbook.
                No transactions, dispatches, or receipts are created.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setConfirming(false)} className="rounded-md border px-3 py-1.5 text-xs font-bold">Cancel</button>
                <button onClick={doImport} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Confirm Import</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-md border p-2 ${tone === "warn" && value > 0 ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
      <div className="text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
        <AlertCircle size={14}/> {title} ({items.length})
      </div>
      <div className="text-xs text-amber-700/90 dark:text-amber-300/90 flex flex-wrap gap-1">
        {items.slice(0, 100).map((s) => (
          <span key={s} className="rounded bg-amber-500/10 px-1.5 py-0.5">{s}</span>
        ))}
        {items.length > 100 && <span>…and {items.length - 100} more</span>}
      </div>
    </div>
  );
}
