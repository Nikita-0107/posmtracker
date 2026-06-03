import * as XLSX from "xlsx";
import { getTlActivityReport } from "@/lib/tl-activity-report.functions";

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function exportTlActivityReport() {
  const rows = await getTlActivityReport();
  const aoa: (string | number)[][] = [[
    "AE ID", "AE Name", "WD Code", "WD Name",
    "TL ID", "TL Name", "Status", "Last Activity", "Current Streak (Days)",
  ]];
  for (const r of rows) {
    aoa.push([
      r.ae_id ?? "",
      r.ae_name ?? "",
      r.wd_code,
      r.wd_name ?? "",
      r.tl_id,
      r.tl_name,
      r.status,
      r.last_activity ?? "",
      r.current_streak ?? 0,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 28 },
    { wch: 10 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TL Activity");
  XLSX.writeFile(wb, `TL_Activity_Report_${stamp()}.xlsx`);
  return rows.length;
}
