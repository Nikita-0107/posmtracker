import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Upload, Loader2, Network, Download, FileSpreadsheet, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, Search, RefreshCw, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { importHierarchy, seedAccountsFromHierarchy } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hierarchy")({
  component: HierarchyPage,
  head: () => ({ meta: [{ title: "Hierarchy — POSM Tracker" }] }),
});

type WspCode = "CEVL" | "CEVJ" | "CEVY";
const VALID_WSPS: readonly WspCode[] = ["CEVL", "CEVJ", "CEVY"] as const;
type Row = { ae_id: string; ae_name: string; wd_code: string; wd_name: string; tl_id: string; tl_name: string; wsp: string };
type RowError = { row: number; field: string; message: string };
type ImportResult = {
  ae_rows: number; wd_rows: number; tl_rows: number;
  ae_added?: number; ae_updated?: number;
  wd_added?: number; wd_updated?: number;
  tl_added?: number; tl_updated?: number;
  wsp_added?: number;
};

const REQUIRED_FIELDS: (keyof Row)[] = ["ae_id", "ae_name", "wd_code", "wd_name"];
const FIELD_LABELS: Record<keyof Row, string> = {
  ae_id: "AE ID", ae_name: "AE Name", wd_code: "WD Code", wd_name: "WD Name", tl_id: "TL ID", tl_name: "TL Name", wsp: "WSP",
};

function downloadTemplate() {
  const headers = ["AE ID", "AE Name", "WD Code", "WD Name", "TL ID", "TL Name", "WSP"];
  const sample = [
    ["VIJ003", "Nanaji", "VI3180", "Sri Kalyani Agencies", "32285", "Guna", "CEVL"],
    ["VIJ003", "Nanaji", "VI3180", "Sri Kalyani Agencies", "31070", "Hanok", "CEVL"],
    ["VIJ003", "Nanaji", "VI3391", "Pavani Enterprises", "31071", "Vinod", "CEVJ"],
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
  wsp: "wsp", wsp_code: "wsp",
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
    const wspRaw = colIdx.wsp !== undefined ? get("wsp").toUpperCase() : "";
    const row: Row = {
      ae_id: get("ae_id"), ae_name: get("ae_name"),
      wd_code: get("wd_code"), wd_name: get("wd_name"),
      tl_id: get("tl_id"), tl_name: get("tl_name"),
      wsp: wspRaw,
    };
    let rowOk = true;
    for (const f of REQUIRED_FIELDS) {
      if (!row[f]) {
        errors.push({ row: excelRow, field: f, message: `${FIELD_LABELS[f]} is missing` });
        rowOk = false;
      }
    }
    if ((row.tl_id && !row.tl_name) || (!row.tl_id && row.tl_name)) {
      errors.push({ row: excelRow, field: "tl_id", message: "Both TL ID and TL Name are required when adding a TL" });
      rowOk = false;
    }
    if (row.wsp && !VALID_WSPS.includes(row.wsp as WspCode)) {
      errors.push({ row: excelRow, field: "wsp", message: `Invalid WSP "${row.wsp}". Allowed: ${VALID_WSPS.join(", ")}` });
      rowOk = false;
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
  const [existing, setExisting] = useState<{
    ae: Set<string>; wd: Set<string>; tl: Set<string>;
    wspByWd: Map<string, string[]>;
  }>({ ae: new Set(), wd: new Set(), tl: new Set(), wspByWd: new Map() });

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, authLoading, rolesLoading, navigate]);

  const loadExisting = useCallback(async () => {
    const [a, w, t, wa] = await Promise.all([
      supabase.from("hierarchy_ae").select("ae_id"),
      supabase.from("hierarchy_wd").select("wd_code"),
      supabase.from("hierarchy_tl").select("tl_id"),
      supabase.from("wd_assignments").select("wd_code, wsp"),
    ]);
    const wspByWd = new Map<string, string[]>();
    for (const row of (wa.data ?? []) as Array<{ wd_code: string; wsp: string }>) {
      const arr = wspByWd.get(row.wd_code) ?? [];
      arr.push(row.wsp);
      wspByWd.set(row.wd_code, arr);
    }
    setExisting({
      ae: new Set((a.data ?? []).map((r) => r.ae_id as string)),
      wd: new Set((w.data ?? []).map((r) => r.wd_code as string)),
      tl: new Set((t.data ?? []).map((r) => r.tl_id as string)),
      wspByWd,
    });
  }, []);

  useEffect(() => { if (isAdmin) void loadExisting(); }, [isAdmin, loadExisting]);

  const summary = useMemo(() => {
    const aeSet = new Set<string>();
    const wdSet = new Set<string>();
    const tlSet = new Set<string>();
    const wspByWd = new Map<string, string>(); // last WSP per WD in file
    for (const r of rows) {
      if (r.ae_id) aeSet.add(r.ae_id);
      if (r.wd_code) wdSet.add(r.wd_code);
      if (r.tl_id) tlSet.add(r.tl_id);
      if (r.wd_code && r.wsp) wspByWd.set(r.wd_code, r.wsp);
    }
    let aeNew = 0, aeDup = 0, wdNew = 0, wdDup = 0, tlNew = 0, tlDup = 0;
    aeSet.forEach((id) => (existing.ae.has(id) ? aeDup++ : aeNew++));
    wdSet.forEach((id) => (existing.wd.has(id) ? wdDup++ : wdNew++));
    tlSet.forEach((id) => (existing.tl.has(id) ? tlDup++ : tlNew++));

    let wspNew = 0, wspExisting = 0;
    wspByWd.forEach((wsp, wd) => {
      const cur = existing.wspByWd.get(wd) ?? [];
      if (cur.includes(wsp)) wspExisting++; else wspNew++;
    });

    return {
      ae: aeSet.size, wd: wdSet.size, tl: tlSet.size,
      aeNew, aeDup, wdNew, wdDup, tlNew, tlDup,
      wspMappings: wspByWd.size, wspNew, wspExisting,
      hasDups: aeDup + wdDup + tlDup > 0,
    };
  }, [rows, existing]);

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

  const [refreshKey, setRefreshKey] = useState(0);

  async function doImport() {
    setBusy(true);
    setConfirming(false);
    try {
      const res = (await importHierarchy({ data: { rows } })) as ImportResult;
      setResult(res);
      const added = (res.ae_added ?? 0) + (res.wd_added ?? 0) + (res.tl_added ?? 0);
      const updated = (res.ae_updated ?? 0) + (res.wd_updated ?? 0) + (res.tl_updated ?? 0);
      toast.success(`Import successful — ${added} added, ${updated} updated. Seeding accounts…`);
      setRows([]); setFileName("");
      setRefreshKey((k) => k + 1);
      void loadExisting();

      // Auto-seed login accounts for newly imported AEs and TLs
      try {
        const seed = (await seedAccountsFromHierarchy({ data: undefined as never })) as {
          ae_created: number; tl_created: number; skipped: number; errors: string[];
        };
        const created = (seed.ae_created ?? 0) + (seed.tl_created ?? 0);
        if (seed.errors?.length) {
          toast.warning(`Seeded ${created} new account(s), ${seed.skipped} already existed, ${seed.errors.length} failed`);
          console.warn("Seed errors:", seed.errors);
        } else {
          toast.success(`Seeded ${created} new login account(s) (${seed.ae_created} AE, ${seed.tl_created} TL). Default password: 123456`);
        }
      } catch (e) {
        toast.error(`Accounts seed failed: ${(e as Error).message}`);
      }

      setTimeout(() => {
        document.getElementById("hierarchy-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
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
                Fill AE and WD fields on every row. TL fields are optional when you only need to add a WD.
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
            Required columns: <code>AE ID, AE Name, WD Code, WD Name</code>. Add <code>TL ID</code> and <code>TL Name</code> when creating TLs. Existing records are updated; new records are added. Nothing is deleted.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="hierarchy-file"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
              <FileSpreadsheet size={14}/> Choose File
            </label>
            <input id="hierarchy-file" type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={onFile} className="sr-only" />
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">
              {fileName || "No file chosen"}
            </span>
          </div>

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
            <div className="space-y-2">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
                <div>
                  <div className="font-bold text-primary mb-1">Import will create (new):</div>
                  <div>• {summary.aeNew} new AE{summary.aeNew !== 1 && "s"}</div>
                  <div>• {summary.wdNew} new WD{summary.wdNew !== 1 && "s"}</div>
                  <div>• {summary.tlNew} new TL{summary.tlNew !== 1 && "s"}</div>
                </div>
                <div className="border-t border-primary/20 pt-2">
                  <div className="font-bold text-muted-foreground mb-1">Already existing (will be skipped):</div>
                  <div>• {summary.aeDup} existing AE{summary.aeDup !== 1 && "s"}</div>
                  <div>• {summary.wdDup} existing WD{summary.wdDup !== 1 && "s"}</div>
                  <div>• {summary.tlDup} existing TL{summary.tlDup !== 1 && "s"}</div>
                </div>
                <div className="pt-1 text-muted-foreground">
                  Totals in file: {summary.ae} AE / {summary.wd} WD / {summary.tl} TL ({rows.length} rows)
                </div>
              </div>
              {summary.hasDups && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                    <AlertCircle size={14}/> Existing records detected
                  </div>
                  {summary.aeDup > 0 && <div>• {summary.aeDup} AE{summary.aeDup !== 1 && "s"} already exist</div>}
                  {summary.wdDup > 0 && <div>• {summary.wdDup} WD{summary.wdDup !== 1 && "s"} already exist</div>}
                  {summary.tlDup > 0 && <div>• {summary.tlDup} TL{summary.tlDup !== 1 && "s"} already exist</div>}
                  <div className="pt-1 text-muted-foreground">These records will be skipped during import. No duplicate accounts or hierarchy records will be created.</div>
                </div>
              )}
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
                <tr><th className="p-2">AE</th><th className="p-2">WD</th><th className="p-2">TL</th><th className="p-2">Status</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => {
                  const aeDup = existing.ae.has(r.ae_id);
                  const wdDup = existing.wd.has(r.wd_code);
                  const tlDup = !!r.tl_id && existing.tl.has(r.tl_id);
                  const anyDup = aeDup || wdDup || tlDup;
                  const allDup = aeDup && wdDup && (!r.tl_id || tlDup);
                  return (
                    <tr key={i} className={`border-t ${allDup ? "bg-amber-500/10" : anyDup ? "bg-amber-500/5" : ""}`}>
                      <td className="p-2">
                        <b>{r.ae_id}</b> {r.ae_name}
                        {aeDup && <span className="ml-1 inline-block rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">Existing AE</span>}
                      </td>
                      <td className="p-2">
                        <b>{r.wd_code}</b> {r.wd_name}
                        {wdDup && <span className="ml-1 inline-block rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">Existing WD</span>}
                      </td>
                      <td className="p-2">
                        <b>{r.tl_id}</b> {r.tl_name}
                        {tlDup && <span className="ml-1 inline-block rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">Existing TL</span>}
                      </td>
                      <td className="p-2">
                        {allDup ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Will be skipped</span>
                        ) : anyDup ? (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Partial — new items only</span>
                        ) : (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">New</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 50 && <div className="p-2 text-muted-foreground">…and {rows.length - 50} more</div>}
          </div>
        )}

        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold">Confirm Import</h3>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-sm space-y-1">
                <div className="font-bold text-primary">Import will create:</div>
                <div>• <b>{summary.aeNew}</b> new AE{summary.aeNew !== 1 && "s"}</div>
                <div>• <b>{summary.wdNew}</b> new WD{summary.wdNew !== 1 && "s"}</div>
                <div>• <b>{summary.tlNew}</b> new TL{summary.tlNew !== 1 && "s"}</div>
              </div>
              {summary.hasDups && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm space-y-1">
                  <div className="font-bold text-amber-700 dark:text-amber-400">Import will skip:</div>
                  <div>• <b>{summary.aeDup}</b> existing AE{summary.aeDup !== 1 && "s"}</div>
                  <div>• <b>{summary.wdDup}</b> existing WD{summary.wdDup !== 1 && "s"}</div>
                  <div>• <b>{summary.tlDup}</b> existing TL{summary.tlDup !== 1 && "s"}</div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Existing records will be updated, not duplicated. Nothing will be deleted.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setConfirming(false)} className="rounded-md border px-3 py-1.5 text-xs font-bold">Cancel</button>
                <button onClick={doImport} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Confirm Import</button>
              </div>
            </div>
          </div>
        )}



        <div id="hierarchy-viewer">
          <HierarchyViewer refreshKey={refreshKey} />
        </div>
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

type AeRow = { ae_id: string; ae_name: string };
type WdRow = { wd_code: string; wd_name: string; ae_id: string };
type TlRow = { tl_id: string; tl_name: string; wd_code: string; active: boolean };

function HierarchyViewer({ refreshKey }: { refreshKey: number }) {
  const [aes, setAes] = useState<AeRow[]>([]);
  const [wds, setWds] = useState<WdRow[]>([]);
  const [tls, setTls] = useState<TlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openAe, setOpenAe] = useState<Set<string>>(new Set());
  const [openWd, setOpenWd] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [a, w, t] = await Promise.all([
      supabase.from("hierarchy_ae").select("ae_id, ae_name").order("ae_id"),
      supabase.from("hierarchy_wd").select("wd_code, wd_name, ae_id").order("wd_code"),
      supabase.from("hierarchy_tl").select("tl_id, tl_name, wd_code, active").order("tl_id"),
    ]);
    if (a.error || w.error || t.error) {
      toast.error((a.error || w.error || t.error)!.message);
      setLoading(false);
      return;
    }
    setAes((a.data ?? []) as AeRow[]);
    setWds((w.data ?? []) as WdRow[]);
    setTls((t.data ?? []) as TlRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const wdsByAe = useMemo(() => {
    const m = new Map<string, WdRow[]>();
    for (const w of wds) {
      if (!m.has(w.ae_id)) m.set(w.ae_id, []);
      m.get(w.ae_id)!.push(w);
    }
    return m;
  }, [wds]);

  const tlsByWd = useMemo(() => {
    const m = new Map<string, TlRow[]>();
    for (const t of tls) {
      if (!m.has(t.wd_code)) m.set(t.wd_code, []);
      m.get(t.wd_code)!.push(t);
    }
    return m;
  }, [tls]);

  const term = q.trim().toLowerCase();
  const matches = (s: string | null | undefined) => !term || (s ?? "").toLowerCase().includes(term);

  const filteredAes = useMemo(() => {
    if (!term) return aes;
    return aes.filter((a) => {
      if (matches(a.ae_id) || matches(a.ae_name)) return true;
      const ws = wdsByAe.get(a.ae_id) ?? [];
      return ws.some((w) =>
        matches(w.wd_code) || matches(w.wd_name) ||
        (tlsByWd.get(w.wd_code) ?? []).some((t) => matches(t.tl_id) || matches(t.tl_name))
      );
    });
  }, [aes, wdsByAe, tlsByWd, term]);

  function toggleAe(id: string) {
    setOpenAe((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleWd(id: string) {
    setOpenWd((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function expandAll() {
    setOpenAe(new Set(filteredAes.map((a) => a.ae_id)));
    setOpenWd(new Set(wds.map((w) => w.wd_code)));
  }
  function collapseAll() { setOpenAe(new Set()); setOpenWd(new Set()); }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="text-primary" size={18} />
          <h2 className="text-sm font-bold">Current Hierarchy</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-bold text-blue-700 dark:text-blue-300">{aes.length} AE</span>
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 font-bold text-green-700 dark:text-green-300">{wds.length} WD</span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700 dark:text-amber-400">{tls.length} TL</span>
          <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-bold hover:bg-muted">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by AE / WD / TL id or name…"
            className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
        </div>
        <button onClick={expandAll} className="rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-muted">Expand all</button>
        <button onClick={collapseAll} className="rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-muted">Collapse</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="animate-spin" size={18} /></div>
      ) : filteredAes.length === 0 ? (
        <div className="rounded-md bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          {aes.length === 0 ? "No hierarchy imported yet." : "No matches."}
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto rounded-md border divide-y text-xs">
          {filteredAes.map((a) => {
            const ws = (wdsByAe.get(a.ae_id) ?? []).filter((w) =>
              !term || matches(w.wd_code) || matches(w.wd_name) || matches(a.ae_id) || matches(a.ae_name) ||
              (tlsByWd.get(w.wd_code) ?? []).some((t) => matches(t.tl_id) || matches(t.tl_name))
            );
            const isOpen = openAe.has(a.ae_id) || !!term;
            return (
              <div key={a.ae_id}>
                <button onClick={() => toggleAe(a.ae_id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50">
                  {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  <b className="text-blue-700 dark:text-blue-300">{a.ae_id}</b>
                  <span className="truncate">{a.ae_name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{ws.length} WD</span>
                </button>
                {isOpen && ws.map((w) => {
                  const ts = (tlsByWd.get(w.wd_code) ?? []).filter((t) =>
                    !term || matches(t.tl_id) || matches(t.tl_name) || matches(w.wd_code) || matches(w.wd_name) || matches(a.ae_id) || matches(a.ae_name)
                  );
                  const wOpen = openWd.has(w.wd_code) || !!term;
                  return (
                    <div key={w.wd_code} className="border-t bg-muted/20">
                      <button onClick={() => toggleWd(w.wd_code)}
                        className="flex w-full items-center gap-2 px-2 py-1.5 pl-7 text-left hover:bg-muted/50">
                        {wOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        <b className="text-green-700 dark:text-green-300">{w.wd_code}</b>
                        <span className="truncate">{w.wd_name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{ts.length} TL</span>
                      </button>
                      {wOpen && ts.length > 0 && (
                        <div className="border-t bg-background/40 pl-12 pr-2 py-1 space-y-0.5">
                          {ts.map((t) => (
                            <div key={t.tl_id} className="flex items-center gap-2 py-0.5">
                              <b className="text-amber-700 dark:text-amber-400">{t.tl_id}</b>
                              <span className="truncate">{t.tl_name}</span>
                              {!t.active && <span className="ml-auto text-[10px] text-destructive">inactive</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
