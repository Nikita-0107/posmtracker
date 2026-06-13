import * as XLSX from "xlsx";
import { getTlHoldingReport } from "@/lib/tl-holding-report.functions";

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function exportTlHoldingReport() {
  const rows = await getTlHoldingReport();
  const aoa: (string | number)[][] = [[
    "TL Name", "TL Code", "WD", "Section",
    "Material Code", "Material Description",
    "Qty Received", "First Received Date",
    "Qty Used", "Qty Returned", "Current Qty Held",
    "Last Activity Date", "Days Since Last Activity",
  ]];
  for (const r of rows) {
    aoa.push([
      r.tl_name,
      r.tl_code,
      r.wd_code,
      r.section,
      r.material_code,
      r.material_name,
      r.qty_received,
      r.first_received_date ?? "",
      r.qty_used,
      r.qty_returned,
      r.current_qty_held,
      r.last_activity_date ?? "",
      r.days_since_last_activity ?? "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 36 },
    { wch: 12 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 16 }, { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TL Inventory Holding");
  XLSX.writeFile(wb, `TL_Inventory_Holding_Report_${stamp()}.xlsx`);
  return rows.length;
}
