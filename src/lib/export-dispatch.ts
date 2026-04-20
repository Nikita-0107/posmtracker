import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { wdMaster } from "@/lib/posm-data";

type MovementRow = {
  created_at: string;
  material_code: string;
  qty: number;
  movement: "receive" | "dispatch";
  distributor: string | null;
};

type MaterialRow = { code: string; name: string };

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function exportDispatchReport() {
  const [movementsRes, materialsRes] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("created_at, material_code, qty, movement, distributor")
      .order("created_at", { ascending: true }),
    supabase.from("materials").select("code, name"),
  ]);

  if (movementsRes.error) throw movementsRes.error;
  if (materialsRes.error) throw materialsRes.error;

  const movements = (movementsRes.data ?? []) as MovementRow[];
  const materials = (materialsRes.data ?? []) as MaterialRow[];

  const matMap = new Map(materials.map((m) => [m.code, m.name]));
  const wdMap = new Map(wdMaster.map((w) => [w.wd_code, w.wd_name]));

  // Legacy distributor-name → wd_code resolver
  const normalizeName = (s: string) =>
    s.split(/[–-]/)[0].replace(/\s+/g, " ").trim().toUpperCase();
  const nameToCode = new Map<string, string>();
  for (const w of wdMaster) {
    nameToCode.set(normalizeName(w.wd_name), w.wd_code);
  }
  function resolveWd(distributor: string | null): { code: string; name: string } {
    const raw = (distributor ?? "").trim();
    if (!raw) return { code: "", name: "" };
    if (wdMap.has(raw)) return { code: raw, name: wdMap.get(raw) ?? "" };
    const code = nameToCode.get(normalizeName(raw));
    if (code) return { code, name: wdMap.get(code) ?? "" };
    return { code: "", name: raw.split(/[–-]/)[0].trim() };
  }

  // -------------------------------------------------------------
  // Sheet 1: Dispatch Log
  // -------------------------------------------------------------
  const dispatches = movements.filter(
    (m) => m.movement === "dispatch" && m.material_code && m.qty > 0,
  );

  const dispatchRows = dispatches
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((m) => {
      const wd = resolveWd(m.distributor);
      return {
        date: formatDateTime(m.created_at),
        invoice_number: "",
        wd_code: wd.code,
        wd_name: wd.name,
        material_code: m.material_code,
        material_name: matMap.get(m.material_code) ?? "",
        quantity: m.qty,
      };
    });

  // -------------------------------------------------------------
  // Sheet 2: WSP Stock Ledger (per material per day)
  //   opening = closing of previous day (running balance per material)
  //   received_from_HO = sum of receive qty that day
  //   dispatched_to_WD = sum of dispatch qty that day
  //   closing = opening + received - dispatched
  // -------------------------------------------------------------
  type DayAgg = { received: number; dispatched: number };
  // material_code -> day -> agg
  const perMatDay = new Map<string, Map<string, DayAgg>>();

  for (const m of movements) {
    if (!m.material_code || m.qty <= 0) continue;
    const day = dayKey(m.created_at);
    let dayMap = perMatDay.get(m.material_code);
    if (!dayMap) {
      dayMap = new Map();
      perMatDay.set(m.material_code, dayMap);
    }
    let agg = dayMap.get(day);
    if (!agg) {
      agg = { received: 0, dispatched: 0 };
      dayMap.set(day, agg);
    }
    if (m.movement === "receive") agg.received += m.qty;
    else if (m.movement === "dispatch") agg.dispatched += m.qty;
  }

  const ledgerRows: {
    date: string;
    material_code: string;
    material_name: string;
    opening_quantity: number;
    received_from_HO: number;
    dispatched_to_WD: number;
    closing_quantity: number;
  }[] = [];

  // Sort materials for stable output
  const matCodes = Array.from(perMatDay.keys()).sort();
  for (const code of matCodes) {
    const dayMap = perMatDay.get(code)!;
    const days = Array.from(dayMap.keys()).sort(); // ascending
    let running = 0;
    for (const day of days) {
      const agg = dayMap.get(day)!;
      const opening = running;
      const closing = opening + agg.received - agg.dispatched;
      ledgerRows.push({
        date: day,
        material_code: code,
        material_name: matMap.get(code) ?? "",
        opening_quantity: opening,
        received_from_HO: agg.received,
        dispatched_to_WD: agg.dispatched,
        closing_quantity: closing,
      });
      running = closing;
    }
  }

  // Sort ledger by date desc, then material_code for readability
  ledgerRows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.material_code.localeCompare(b.material_code);
  });

  // -------------------------------------------------------------
  // Build workbook
  // -------------------------------------------------------------
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(dispatchRows, {
    header: [
      "date",
      "invoice_number",
      "wd_code",
      "wd_name",
      "material_code",
      "material_name",
      "quantity",
    ],
  });
  ws1["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 10 },
    { wch: 36 },
    { wch: 14 },
    { wch: 36 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Dispatch Log");

  const ws2 = XLSX.utils.json_to_sheet(ledgerRows, {
    header: [
      "date",
      "material_code",
      "material_name",
      "opening_quantity",
      "received_from_HO",
      "dispatched_to_WD",
      "closing_quantity",
    ],
  });
  ws2["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "WSP Stock Ledger");

  const filename = `POSM_WSP_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);

  return { rows: dispatchRows.length, ledgerRows: ledgerRows.length, filename };
}
