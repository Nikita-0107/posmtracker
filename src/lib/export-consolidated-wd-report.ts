import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtGeneratedOn() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function exportConsolidatedWdReport(opts: {
  aeId: string;
  aeName: string;
}) {
  const { aeId, aeName } = opts;

  // AE's WDs (RLS also scopes, but filter explicitly for safety)
  const { data: wdRows, error: wdErr } = await supabase
    .from("hierarchy_wd")
    .select("wd_code, wd_name")
    .eq("ae_id", aeId)
    .order("wd_code");
  if (wdErr) throw wdErr;
  const wds = (wdRows ?? []) as { wd_code: string; wd_name: string }[];
  const wdCodes = wds.map((w) => w.wd_code);
  const wdNameMap = new Map(wds.map((w) => [w.wd_code, w.wd_name]));

  if (wdCodes.length === 0) {
    throw new Error("No WDs are mapped to your AE.");
  }

  const [matsRes, stockRes, tlsRes, transitRes] = await Promise.all([
    supabase.from("materials").select("code, name"),
    supabase
      .from("wd_stock")
      .select("wd_code, material_code, qty, updated_at")
      .in("wd_code", wdCodes),
    supabase
      .from("hierarchy_tl")
      .select("wd_code, tl_id, tl_name, active")
      .in("wd_code", wdCodes),
    supabase
      .from("stock_movements")
      .select("distributor, material_code, qty")
      .eq("movement", "dispatch")
      .eq("item_status", "pending")
      .in("distributor", wdCodes),
  ]);

  const materials = (matsRes.data ?? []) as { code: string; name: string }[];
  const matName = new Map(materials.map((m) => [m.code, m.name]));
  const stock = (stockRes.data ?? []) as {
    wd_code: string;
    material_code: string;
    qty: number;
    updated_at: string;
  }[];
  const tls = (tlsRes.data ?? []) as {
    wd_code: string;
    tl_id: string;
    tl_name: string;
    active: boolean;
  }[];
  const transit = (transitRes.data ?? []) as {
    distributor: string;
    material_code: string;
    qty: number;
  }[];

  // TLs per WD (active only first, then others)
  const tlsByWd = new Map<string, { tl_id: string; tl_name: string }[]>();
  for (const t of tls) {
    const list = tlsByWd.get(t.wd_code) ?? [];
    list.push({ tl_id: t.tl_id, tl_name: t.tl_name });
    tlsByWd.set(t.wd_code, list);
  }
  const tlIdsFor = (wd: string) =>
    (tlsByWd.get(wd) ?? []).map((t) => t.tl_id).join(", ");
  const tlNamesFor = (wd: string) =>
    (tlsByWd.get(wd) ?? []).map((t) => t.tl_name).join(", ");

  // In-transit per (wd, material)
  const transitMap = new Map<string, number>();
  for (const r of transit) {
    const k = `${r.distributor}|${r.material_code}`;
    transitMap.set(k, (transitMap.get(k) ?? 0) + (r.qty ?? 0));
  }

  // Build detail rows
  const detailRows = stock
    .filter((s) => (s.qty ?? 0) > 0 || (transitMap.get(`${s.wd_code}|${s.material_code}`) ?? 0) > 0)
    .map((s) => {
      const transitQty = transitMap.get(`${s.wd_code}|${s.material_code}`) ?? 0;
      return {
        "WD Code": s.wd_code,
        "WD Name": wdNameMap.get(s.wd_code) ?? "",
        "TL ID": tlIdsFor(s.wd_code),
        "TL Name": tlNamesFor(s.wd_code),
        "Material Code": s.material_code,
        "Material Description": matName.get(s.material_code) ?? "",
        "Current SOH": s.qty ?? 0,
        "In Transit": transitQty,
        "Last Updated": fmtDateTime(s.updated_at),
      };
    })
    .sort(
      (a, b) =>
        String(a["WD Code"]).localeCompare(String(b["WD Code"])) ||
        String(a["Material Code"]).localeCompare(String(b["Material Code"])),
    );

  // Summary
  const totalWds = wds.length;
  const uniqueMaterials = new Set(detailRows.map((r) => r["Material Code"]));
  const totalStockUnits = detailRows.reduce((a, r) => a + (r["Current SOH"] as number), 0);

  const header = [
    "WD Code",
    "WD Name",
    "TL ID",
    "TL Name",
    "Material Code",
    "Material Description",
    "Current SOH",
    "In Transit",
    "Last Updated",
  ];

  // Build AOA with title/summary header band, then data table
  const aoa: (string | number)[][] = [];
  aoa.push(["Consolidated WD Stock Report"]);
  aoa.push([`AE: ${aeId} - ${aeName}`]);
  aoa.push([`Generated On: ${fmtGeneratedOn()}`]);
  aoa.push([]);
  aoa.push(["Total WDs Covered", totalWds]);
  aoa.push(["Total Materials", uniqueMaterials.size]);
  aoa.push(["Total Stock Units", totalStockUnits]);
  aoa.push([]);
  const headerRowIndex = aoa.length; // 0-based row index of column header
  aoa.push(header);
  for (const r of detailRows) {
    aoa.push(header.map((h) => (r as Record<string, string | number>)[h] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = header.map((h, i) => {
    let max = h.length;
    for (let r = headerRowIndex + 1; r < aoa.length; r++) {
      const v = aoa[r][i];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(50, Math.max(12, max + 2)) };
  });

  // Merges for title rows (across header width)
  const lastCol = header.length - 1;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
  ];

  // Style title + headers
  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: "left", vertical: "center" },
    };
  }
  for (let r = 1; r <= 2; r++) {
    const c = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (c) c.s = { font: { bold: true } };
  }
  for (let r = 4; r <= 6; r++) {
    const labelCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (labelCell) labelCell.s = { font: { bold: true } };
  }
  for (let c = 0; c < header.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    const cell = ws[addr];
    if (cell) {
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "EEEEEE" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
  }

  // Freeze the header row of the data table
  ws["!freeze"] = { xSplit: 0, ySplit: headerRowIndex + 1 };
  ws["!panes"] = [
    {
      ySplit: headerRowIndex + 1,
      topLeftCell: `A${headerRowIndex + 2}`,
      activePane: "bottomLeft",
      state: "frozen",
    },
  ];

  // Excel autofilter on the data table
  const lastRow = aoa.length - 1;
  if (lastRow > headerRowIndex) {
    ws["!autofilter"] = {
      ref: `${XLSX.utils.encode_cell({ r: headerRowIndex, c: 0 })}:${XLSX.utils.encode_cell({ r: lastRow, c: lastCol })}`,
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Consolidated WD Stock");

  const filename = `Consolidated_WD_Report_${aeId}_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename, { cellStyles: true });
  return {
    filename,
    totalWds,
    totalMaterials: uniqueMaterials.size,
    totalStockUnits,
    rows: detailRows.length,
  };
}
