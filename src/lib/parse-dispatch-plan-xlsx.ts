import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { WspCode } from "@/hooks/use-auth";
import type { BulkPlanRow } from "@/hooks/use-dispatch-plans";

const VALID_WSPS: WspCode[] = ["CEVL", "CEVJ", "CEVY"];

export type ParseRowError = { row: number; message: string };
export type ParsedRow = BulkPlanRow & { row: number };

export type ParseResult = {
  rows: ParsedRow[];
  errors: ParseRowError[];
};

/** Header detection: case-insensitive match on common variants. */
function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const HEADER_MAP: Record<string, "wsp" | "wd_code" | "material_code" | "qty"> = {
  wsp: "wsp",
  wdcode: "wd_code",
  wd: "wd_code",
  materialcode: "material_code",
  material: "material_code",
  qty: "qty",
  quantity: "qty",
};

export async function parseDispatchPlanXlsx(
  file: File,
  opts: { allowedWsps: WspCode[] | "all" },
): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (raw.length === 0) return { rows: [], errors: [{ row: 0, message: "Sheet is empty" }] };

  // Build column index from first row's keys
  const firstKeys = Object.keys(raw[0]);
  const colMap: Partial<Record<"wsp" | "wd_code" | "material_code" | "qty", string>> = {};
  for (const k of firstKeys) {
    const mapped = HEADER_MAP[normalizeHeader(k)];
    if (mapped) colMap[mapped] = k;
  }
  const missing = (["wsp", "wd_code", "material_code", "qty"] as const).filter((c) => !colMap[c]);
  if (missing.length) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Missing columns: ${missing.join(", ")}` }],
    };
  }

  // Pull reference data once
  const allowedSet =
    opts.allowedWsps === "all" ? new Set(VALID_WSPS) : new Set(opts.allowedWsps);
  const wspsToFetch = Array.from(allowedSet);
  const [assignRes, matRes] = await Promise.all([
    supabase.from("wd_assignments").select("wd_code, wsp").in("wsp", wspsToFetch),
    supabase.from("materials").select("code"),
  ]);
  const wdByWsp = new Map<string, Set<string>>();
  for (const a of (assignRes.data ?? []) as { wd_code: string; wsp: string }[]) {
    if (!wdByWsp.has(a.wsp)) wdByWsp.set(a.wsp, new Set());
    wdByWsp.get(a.wsp)!.add(a.wd_code);
  }
  const materials = new Set<string>((matRes.data ?? []).map((m: { code: string }) => m.code));

  const rows: ParsedRow[] = [];
  const errors: ParseRowError[] = [];

  raw.forEach((r, i) => {
    const rowNo = i + 2; // +1 for 0-index, +1 for header
    const wsp = String(r[colMap.wsp!] ?? "").trim().toUpperCase() as WspCode;
    const wd_code = String(r[colMap.wd_code!] ?? "").trim().toUpperCase();
    const material_code = String(r[colMap.material_code!] ?? "").trim();
    const qtyRaw = r[colMap.qty!];
    const qty = typeof qtyRaw === "number" ? qtyRaw : Number(String(qtyRaw).trim());

    if (!wsp && !wd_code && !material_code && !qtyRaw) return; // skip blank row

    if (!VALID_WSPS.includes(wsp)) {
      errors.push({ row: rowNo, message: `WSP "${wsp}" is not valid` });
      return;
    }
    if (!allowedSet.has(wsp)) {
      errors.push({ row: rowNo, message: `You are not allowed to upload for WSP ${wsp}` });
      return;
    }
    if (!wd_code) {
      errors.push({ row: rowNo, message: "WD Code is empty" });
      return;
    }
    const wdsForWsp = wdByWsp.get(wsp);
    if (!wdsForWsp || !wdsForWsp.has(wd_code)) {
      errors.push({ row: rowNo, message: `WD ${wd_code} is not mapped to ${wsp}` });
      return;
    }
    if (!material_code) {
      errors.push({ row: rowNo, message: "Material code is empty" });
      return;
    }
    if (!materials.has(material_code)) {
      errors.push({ row: rowNo, message: `Material code ${material_code} not found` });
      return;
    }
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push({ row: rowNo, message: "Quantity must be a positive integer" });
      return;
    }

    rows.push({ row: rowNo, wsp, wd_code, material_code, qty });
  });

  return { rows, errors };
}
