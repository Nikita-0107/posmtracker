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

function styleHeaderRow(ws: XLSX.WorkSheet, rowIndex: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = ws[addr];
    if (cell) {
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "EEEEEE" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
  }
}

function autoCols(aoa: (string | number)[][], header: string[], headerRowIndex: number) {
  return header.map((h, i) => {
    let max = h.length;
    for (let r = headerRowIndex + 1; r < aoa.length; r++) {
      const v = aoa[r]?.[i];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(50, Math.max(12, max + 2)) };
  });
}

export async function exportConsolidatedWdReport(opts: {
  aeId: string;
  aeName: string;
}) {
  const { aeId, aeName } = opts;

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

  const [matsRes, stockRes, teamRes, transitRes] = await Promise.all([
    supabase.from("materials").select("code, name"),
    supabase
      .from("wd_stock")
      .select("wd_code, material_code, qty, updated_at")
      .in("wd_code", wdCodes),
    supabase.rpc("get_ae_tl_team_report", { _ae_id: aeId, _inactivity_days: 7 }),
    supabase
      .from("stock_movements")
      .select("distributor, material_code, qty")
      .eq("movement", "dispatch")
      .eq("item_status", "pending")
      .in("distributor", wdCodes),
  ]);

  if (teamRes.error) throw teamRes.error;

  const materials = (matsRes.data ?? []) as { code: string; name: string }[];
  const matName = new Map(materials.map((m) => [m.code, m.name]));
  const stock = (stockRes.data ?? []) as {
    wd_code: string;
    material_code: string;
    qty: number;
    updated_at: string;
  }[];
  const team = (teamRes.data ?? []) as {
    wd_code: string;
    wd_name: string;
    tl_id: string;
    tl_name: string;
    is_wd_receiver: boolean;
    status: string;
    last_activity: string | null;
    current_streak: number;
    total_active_days: number;
    active_days_this_month: number;
    tl_stock_units: number;
    material_types: number;
  }[];
  const transit = (transitRes.data ?? []) as {
    distributor: string;
    material_code: string;
    qty: number;
  }[];

  const transitMap = new Map<string, number>();
  for (const r of transit) {
    const k = `${r.distributor}|${r.material_code}`;
    transitMap.set(k, (transitMap.get(k) ?? 0) + (r.qty ?? 0));
  }


  // ============ Sheet 1: WD Stock Report ============
  const stockHeader = [
    "WD Code",
    "WD Name",
    "Material Code",
    "Material Description",
    "Current SOH",
    "In Transit",
    "Last Updated",
  ];

  const detailRows = stock
    .filter((s) => (s.qty ?? 0) > 0 || (transitMap.get(`${s.wd_code}|${s.material_code}`) ?? 0) > 0)
    .map((s) => {
      const transitQty = transitMap.get(`${s.wd_code}|${s.material_code}`) ?? 0;
      return {
        "WD Code": s.wd_code,
        "WD Name": wdNameMap.get(s.wd_code) ?? "",
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

  const totalWds = wds.length;
  const uniqueMaterials = new Set(detailRows.map((r) => r["Material Code"]));
  const totalStockUnits = detailRows.reduce((a, r) => a + (r["Current SOH"] as number), 0);

  const aoa1: (string | number)[][] = [];
  aoa1.push(["Consolidated WD Stock Report"]);
  aoa1.push([`AE: ${aeId} - ${aeName}`]);
  aoa1.push([`Generated On: ${fmtGeneratedOn()}`]);
  aoa1.push([]);
  aoa1.push(["Total WDs Covered", totalWds]);
  aoa1.push(["Total Materials", uniqueMaterials.size]);
  aoa1.push(["Total Stock Units", totalStockUnits]);
  aoa1.push([]);
  const hdrIdx1 = aoa1.length;
  aoa1.push(stockHeader);
  for (const r of detailRows) {
    aoa1.push(stockHeader.map((h) => (r as Record<string, string | number>)[h] ?? ""));
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
  ws1["!cols"] = autoCols(aoa1, stockHeader, hdrIdx1);
  const lastCol1 = stockHeader.length - 1;
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol1 } },
  ];
  const t1 = ws1[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (t1) t1.s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "left" } };
  for (let r = 1; r <= 2; r++) {
    const c = ws1[XLSX.utils.encode_cell({ r, c: 0 })];
    if (c) c.s = { font: { bold: true } };
  }
  for (let r = 4; r <= 6; r++) {
    const c = ws1[XLSX.utils.encode_cell({ r, c: 0 })];
    if (c) c.s = { font: { bold: true } };
  }
  styleHeaderRow(ws1, hdrIdx1, stockHeader.length);
  ws1["!panes"] = [
    {
      ySplit: hdrIdx1 + 1,
      topLeftCell: `A${hdrIdx1 + 2}`,
      activePane: "bottomLeft",
      state: "frozen",
    },
  ];
  const lastRow1 = aoa1.length - 1;
  if (lastRow1 > hdrIdx1) {
    ws1["!autofilter"] = {
      ref: `${XLSX.utils.encode_cell({ r: hdrIdx1, c: 0 })}:${XLSX.utils.encode_cell({ r: lastRow1, c: lastCol1 })}`,
    };
  }

  // ============ Sheet 2: WD to TL Mapping ============
  const tlHeader = [
    "WD Code",
    "WD Name",
    "TL ID",
    "TL Name",
    "Super TL",
    "TL Status",
    "Last App Activity Date",
    "Current Streak",
    "TL Stock Units",
    "Material Types",
  ];

  function fmtActivity(d: string | null) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${pad(dt.getDate())}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
  }

  const tlRows = team.map((t) => ({
    "WD Code": t.wd_code,
    "WD Name": t.wd_name ?? "",
    "TL ID": t.tl_id,
    "TL Name": t.tl_name,
    "Super TL": t.is_wd_receiver ? "Yes" : "No",
    "TL Status": t.status,
    "Last App Activity Date": fmtActivity(t.last_activity),
    "Current Streak": t.current_streak ?? 0,
    "TL Stock Units": t.tl_stock_units ?? 0,
    "Material Types": t.material_types ?? 0,
  }));


  const aoa2: (string | number)[][] = [];
  aoa2.push(["WD to TL Mapping"]);
  aoa2.push([`AE: ${aeId} - ${aeName}`]);
  aoa2.push([`Generated On: ${fmtGeneratedOn()}`]);
  aoa2.push([]);
  const hdrIdx2 = aoa2.length;
  aoa2.push(tlHeader);
  for (const r of tlRows) {
    aoa2.push(tlHeader.map((h) => (r as Record<string, string | number>)[h] ?? ""));
  }

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!cols"] = autoCols(aoa2, tlHeader, hdrIdx2);
  const lastCol2 = tlHeader.length - 1;
  ws2["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol2 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol2 } },
  ];
  const t2 = ws2[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (t2) t2.s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "left" } };
  for (let r = 1; r <= 2; r++) {
    const c = ws2[XLSX.utils.encode_cell({ r, c: 0 })];
    if (c) c.s = { font: { bold: true } };
  }
  styleHeaderRow(ws2, hdrIdx2, tlHeader.length);
  ws2["!panes"] = [
    {
      ySplit: hdrIdx2 + 1,
      topLeftCell: `A${hdrIdx2 + 2}`,
      activePane: "bottomLeft",
      state: "frozen",
    },
  ];
  const lastRow2 = aoa2.length - 1;
  if (lastRow2 > hdrIdx2) {
    ws2["!autofilter"] = {
      ref: `${XLSX.utils.encode_cell({ r: hdrIdx2, c: 0 })}:${XLSX.utils.encode_cell({ r: lastRow2, c: lastCol2 })}`,
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "WD Stock Report");
  XLSX.utils.book_append_sheet(wb, ws2, "WD to TL Mapping");

  const filename = `Consolidated_WD_Report_${aeId}_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename, { cellStyles: true });
  return {
    filename,
    totalWds,
    totalMaterials: uniqueMaterials.size,
    totalStockUnits,
    rows: detailRows.length,
    tlRows: tlRows.length,
  };
}
