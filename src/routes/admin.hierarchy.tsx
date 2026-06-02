import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Upload, Loader2, Network, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { importHierarchy } from "@/server/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hierarchy")({
  component: HierarchyPage,
  head: () => ({ meta: [{ title: "Hierarchy — POSM Tracker" }] }),
});

type Row = { ae_id: string; ae_name: string; wd_code: string; wd_name: string; tl_id: string; tl_name: string };
type RowError = { row: number; field: string; message: string };
type ImportResult = {
  ae_rows: number; wd_rows: number; tl_rows: number;
  ae_added?: number; ae_updated?: number;
  wd_added?: number; wd_updated?: number;
  tl_added?: number; tl_updated?: number;
};

const REQUIRED_FIELDS: (keyof Row)[] = ["ae_id", "ae_name", "wd_code", "wd_name", "tl_id", "tl_name"];
const FIELD_LABELS: Record<keyof Row, string> = {
  ae_id: "AE ID", ae_name: "AE Name", wd_code: "WD Code", wd_name: "WD Name", tl_id: "TL ID", tl_name: "TL Name",
};

function downloadTemplate() {
  const headers = ["AE ID", "AE Name", "WD Code", "WD Name", "TL ID", "TL Name"];
  const sample = [
    ["VIJ003", "Nanaji", "VI3180", "Sri Kalyani Agencies", "32285", "Guna"],
    ["VIJ003", "Nanaji", "VI3180", "Sri Kalyani Agencies", "31070", "Hanok"],
    ["VIJ003", "Nanaji", "VI3391", "Pavani Enterprises", "31071", "Vinod"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hierarchy");
  XLSX.writeFile(wb, "hierarchy_template.xlsx");
}

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

const HEADER_ALIASES: Record<string, keyof Row> = {
  ae_id: "ae_id", ae_code: "ae_id",
  ae_name: "ae_name",
  wd_code: "wd_code", wd_id: "wd_code",
  wd_name: "wd_name",
  tl_id: "tl_id", tl_code: "tl_id",
  tl_name: "tl_name",
};

function parseSheet(aoa: unknown[][]): { rows: Row[]; errors: RowError[] } {
  const errors: RowError[] = [];
  if (aoa.length < 2) return { rows: [], errors: [{ row: 0, field: "file", message: "File is empty or has no data rows." }] };

  const headers = (aoa[0] as unknown[]).map((h) => HEADER_ALIASES[normalizeHeader(String(h ?? ""))]);
  const colIdx: Partial<Record<keyof Row, number>> = {};
  headers.forEach((h, i) => { if (h && colIdx[h] === undefined) colIdx[h] = i; });

  const missingCols = REQUIRED_FIELDS.filter((f) => colIdx[f] === undefined);
  if (missingCols.length > 0) {
    return { rows: [], errors: [{ row: 0, field: "headers", message: `Missing required columns: ${missingCols.map((f) => FIELD_LABELS[f]).join(", ")}` }] };
  }

  const rows: Row[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] as unknown[];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;
    const excelRow = i + 1;
    const get = (f: keyof Row) => String(r[colIdx[f]!] ?? "").trim();
    const row: Row = {
      ae_id: get("ae_id"), ae_name: get("ae_name"),
      wd_code: get("wd_code"), wd_name: get("wd_name"),
      tl_id: get("tl_id"), tl_name: get("tl_name"),
    };
    let rowOk = true;
    for (const f of REQUIRED_FIELDS) {
      if (!row[f]) {
        errors.push({ row: excelRow, field: f, message: `${FIELD_LABELS[f]} is missing` });
        rowOk = false;
      }
    }
    if (rowOk) rows.push(row);
  }
  return { rows, errors };
}

function HierarchyPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, authLoading, rolesLoading, navigate]);

  const summary = useMemo(() => {
    const aeSet = new Set<string>();
    const wdSet = new Set<string>();
    const tlSet = new Set<string>();
    for (const r of rows) { aeSet.add(r.ae_id); wdSet.add(r.wd_code); tlSet.add(r.tl_id); }
    return { ae: aeSet.size, wd: wdSet.size, tl: tlSet.size };
  }, [rows]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    const isExcel = /\.(xlsx|xls)$/i.test(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let aoa: unknown[][];
        if (isExcel) {
          const wb = XLSX.read(reader.result as ArrayBuffer, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
        } else {
          const wb = XLSX.read(String(reader.result || ""), { type: "string" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
        }
        const { rows: parsed, errors: errs } = parseSheet(aoa);
        setRows(parsed);
        setErrors(errs);
        if (errs.length === 0) toast.success(`Parsed ${parsed.length} rows`);
        else toast.warning(`${parsed.length} valid row(s), ${errs.length} error(s) — please fix and reupload`);
      } catch (err) {
        toast.error((err as Error).message);
        setRows([]); setErrors([{ row: 0, field: "file", message: (err as Error).message }]);
      }
    };
    if (isExcel) reader.readAsArrayBuffer(f);
    else reader.readAsText(f);
  }

  async function doImport() {
    setBusy(true);
    setConfirming(false);
    try {
      const res = (await importHierarchy({ data: { rows } })) as ImportResult;
      setResult(res);
      toast.success("Import successful");
      setRows([]); setFileName("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return <AppShell><div className="p-4 text-sm text-muted-foreground">Super Admin only.</div></AppShell>;

  const canImport = rows.length > 0 && errors.length === 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <AdminTabs />
        <div className="flex items-center gap-2">
          <Network className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">Master Hierarchy Import</h1>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <h2 className="text-sm font-bold">Step 1 — Download template</h2>
              <p className="text-xs text-muted-foreground">
                Every row must be fully filled in. No merged cells, no blanks, no inherited values.
              </p>
            </div>
            <button onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
              <Download size={14}/> Download Hierarchy Template
            </button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold">Step 2 — Upload filled file</h2>
          <p className="text-xs text-muted-foreground">
            Required columns: <code>AE ID, AE Name, WD Code, WD Name, TL ID, TL Name</code>. Existing records are updated; new records are added. Nothing is deleted.
          </p>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onFile} className="block w-full text-sm" />

          {!fileName && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <FileSpreadsheet size={14}/> Please select a hierarchy file to continue. The Import button will enable once a valid file is loaded.
            </div>
          )}

          {fileName && (
            <div className="text-xs text-muted-foreground">Loaded: <b>{fileName}</b></div>
          )}

          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                <AlertCircle size={14}/> {errors.length} error(s) — fix the file and reupload
              </div>
              <ul className="max-h-48 overflow-y-auto text-xs text-destructive space-y-0.5">
                {errors.slice(0, 100).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
                {errors.length > 100 && <li>…and {errors.length - 100} more</li>}
              </ul>
            </div>
          )}

          {rows.length > 0 && errors.length === 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
              <div className="font-bold text-primary">You are about to import:</div>
              <div>• {summary.ae} AE{summary.ae !== 1 && "s"}</div>
              <div>• {summary.wd} WD{summary.wd !== 1 && "s"}</div>
              <div>• {summary.tl} TL{summary.tl !== 1 && "s"}</div>
              <div className="pt-1 text-muted-foreground">({rows.length} total rows)</div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setConfirming(true)} disabled={busy || !canImport}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Loader2 className="animate-spin" size={12}/> : <Upload size={12}/>} Import
            </button>
            {!canImport && !busy && (
              <span className="text-xs text-muted-foreground">
                {rows.length === 0 ? "No valid rows yet" : "Fix errors above to enable import"}
              </span>
            )}
          </div>
        </div>

        {result && (
          <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-400">
              <CheckCircle2 size={16}/> Import Successful
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <Stat label="AEs added" value={result.ae_added ?? 0} sub={`${result.ae_updated ?? 0} updated`}/>
              <Stat label="WDs added" value={result.wd_added ?? 0} sub={`${result.wd_updated ?? 0} updated`}/>
              <Stat label="TLs added" value={result.tl_added ?? 0} sub={`${result.tl_updated ?? 0} updated`}/>
            </div>
          </div>
        )}

        {rows.length > 0 && errors.length === 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-2">AE</th><th className="p-2">WD</th><th className="p-2">TL</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><b>{r.ae_id}</b> {r.ae_name}</td>
                    <td className="p-2"><b>{r.wd_code}</b> {r.wd_name}</td>
                    <td className="p-2"><b>{r.tl_id}</b> {r.tl_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div className="p-2 text-muted-foreground">…and {rows.length - 50} more</div>}
          </div>
        )}

        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold">Confirm Import</h3>
              <p className="text-sm text-muted-foreground">You are about to import:</p>
              <ul className="text-sm space-y-1">
                <li>• <b>{summary.ae}</b> AE{summary.ae !== 1 && "s"}</li>
                <li>• <b>{summary.wd}</b> WD{summary.wd !== 1 && "s"}</li>
                <li>• <b>{summary.tl}</b> TL{summary.tl !== 1 && "s"}</li>
              </ul>
              <p className="text-xs text-muted-foreground">Existing records will be updated. Nothing will be deleted.</p>
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

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
