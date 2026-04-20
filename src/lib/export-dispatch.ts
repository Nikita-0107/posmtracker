import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { wdMaster } from "@/lib/posm-data";

type DispatchRow = {
  created_at: string;
  material_code: string;
  qty: number;
  distributor: string | null;
};

type MaterialRow = { code: string; name: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function exportDispatchReport() {
  const [movementsRes, materialsRes] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("created_at, material_code, qty, distributor")
      .eq("movement", "dispatch")
      .order("created_at", { ascending: false }),
    supabase.from("materials").select("code, name"),
  ]);

  if (movementsRes.error) throw movementsRes.error;
  if (materialsRes.error) throw materialsRes.error;

  const movements = (movementsRes.data ?? []) as DispatchRow[];
  const materials = (materialsRes.data ?? []) as MaterialRow[];

  const matMap = new Map(materials.map((m) => [m.code, m.name]));
  const wdMap = new Map(wdMaster.map((w) => [w.wd_code, w.wd_name]));

  // Sheet 1: Dispatch Data
  const dispatchRows = movements
    .filter((m) => m.distributor && m.material_code && m.qty > 0)
    .map((m) => ({
      Date: formatDate(m.created_at),
      wd_code: m.distributor ?? "",
      wd_name: wdMap.get(m.distributor ?? "") ?? "",
      material_code: m.material_code,
      material_name: matMap.get(m.material_code) ?? "",
      quantity: m.qty,
    }));

  // Summary: by WD
  const wdTotals = new Map<string, number>();
  // Summary: by Material
  const matTotals = new Map<string, number>();

  for (const r of dispatchRows) {
    wdTotals.set(r.wd_code, (wdTotals.get(r.wd_code) ?? 0) + r.quantity);
    matTotals.set(r.material_code, (matTotals.get(r.material_code) ?? 0) + r.quantity);
  }

  const wdSummary = Array.from(wdTotals.entries())
    .map(([wd_code, total_quantity]) => ({
      wd_code,
      wd_name: wdMap.get(wd_code) ?? "",
      total_quantity,
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity);

  const matSummary = Array.from(matTotals.entries())
    .map(([material_code, total_quantity]) => ({
      material_code,
      material_name: matMap.get(material_code) ?? "",
      total_quantity,
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity);

  // Build summary sheet with section headers
  const summaryAoa: (string | number)[][] = [
    ["Total Quantity by WD"],
    ["wd_code", "wd_name", "total_quantity"],
    ...wdSummary.map((r) => [r.wd_code, r.wd_name, r.total_quantity]),
    [],
    ["Total Quantity by Material"],
    ["material_code", "material_name", "total_quantity"],
    ...matSummary.map((r) => [r.material_code, r.material_name, r.total_quantity]),
  ];

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(dispatchRows, {
    header: ["Date", "wd_code", "wd_name", "material_code", "material_name", "quantity"],
  });
  ws1["!cols"] = [
    { wch: 18 },
    { wch: 10 },
    { wch: 36 },
    { wch: 14 },
    { wch: 36 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Dispatch Data");

  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws2["!cols"] = [{ wch: 16 }, { wch: 38 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  const filename = `POSM_Dispatch_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);

  return { rows: dispatchRows.length, filename };
}
