import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { wdMaster } from "@/lib/posm-data";

type MovementRow = {
  created_at: string;
  material_code: string;
  qty: number;
  movement: "receive" | "dispatch";
  distributor: string | null;
  wsp: string;
  reference_number: string | null;
  proof_image_path: string | null;
  received_date: string | null;
  batch_type: string | null;
  dispatch_id: string | null;
  dispatch_date: string | null;
};

function ageInDays(fromISO: string): number {
  const d = new Date(fromISO + "T00:00:00");
  if (isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days for export portability

async function signProofPaths(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter((p) => !!p)));
  if (unique.length === 0) return map;
  // Supabase supports batch sign via createSignedUrls
  const { data, error } = await supabase.storage
    .from("proofs")
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return map;
  for (const item of data) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

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
      .select(
        "created_at, material_code, qty, movement, distributor, wsp, reference_number, proof_image_path, received_date, batch_type, dispatch_id, dispatch_date",
      )
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
  // Sign all proof image paths in one batch (7 day signed URLs)
  // -------------------------------------------------------------
  const allProofPaths = movements
    .map((m) => m.proof_image_path)
    .filter((p): p is string => !!p);
  const signedMap = await signProofPaths(allProofPaths);

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
      const proofUrl = m.proof_image_path ? signedMap.get(m.proof_image_path) ?? "" : "";
      return {
        date: formatDateTime(m.created_at),
        dispatch_date: m.dispatch_date ?? dayKey(m.created_at),
        dispatch_id: m.dispatch_id ?? "",
        wd_code: wd.code,
        wd_name: wd.name,
        material_code: m.material_code,
        material_name: matMap.get(m.material_code) ?? "",
        quantity: m.qty,
        proof_url: proofUrl,
      };
    });

  // -------------------------------------------------------------
  // Sheet (extra): Receive Log — receive movements with proof links
  // -------------------------------------------------------------
  const receives = movements.filter(
    (m) => m.movement === "receive" && m.material_code && m.qty > 0,
  );

  // Walk all movements chronologically (ascending) and track running balance
  // per (wsp, material_code). For each receive, capture the closing balance
  // immediately after the receive is applied.
  const runningBalance = new Map<string, number>();
  const receiveClosingByMovement = new Map<string, number>(); // key: created_at|wsp|code|qty|ref
  for (const m of movements) {
    if (!m.material_code || m.qty <= 0) continue;
    const k = `${m.wsp}::${m.material_code}`;
    const prev = runningBalance.get(k) ?? 0;
    const next = m.movement === "receive" ? prev + m.qty : prev - m.qty;
    runningBalance.set(k, next);
    if (m.movement === "receive") {
      const id = `${m.created_at}|${m.wsp}|${m.material_code}|${m.qty}|${m.reference_number ?? ""}`;
      receiveClosingByMovement.set(id, next);
    }
  }

  const todayDisplay = todayStamp();
  const receiveRows = receives
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((m) => {
      const proofUrl = m.proof_image_path ? signedMap.get(m.proof_image_path) ?? "" : "";
      const rdate = m.received_date ?? dayKey(m.created_at);
      const id = `${m.created_at}|${m.wsp}|${m.material_code}|${m.qty}|${m.reference_number ?? ""}`;
      const closing = receiveClosingByMovement.get(id) ?? 0;
      return {
        date: formatDateTime(m.created_at),
        wsp: m.wsp,
        material_code: m.material_code,
        material_name: matMap.get(m.material_code) ?? "",
        quantity: m.qty,
        invoice_number: m.reference_number ?? "",
        received_date: rdate,
        current_date: todayDisplay,
        age_days: ageInDays(rdate),
        batch_type: m.batch_type ?? "",
        closing_quantity: closing,
        proof_url: proofUrl,
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
  // key = `${wsp}::${material_code}` -> day -> agg
  // Group by WSP + material so the running balance per material matches
  // the per-WSP stock table exactly (admins may see multiple WSPs).
  const perKeyDay = new Map<string, Map<string, DayAgg>>();

  for (const m of movements) {
    if (!m.material_code || m.qty <= 0) continue;
    const day = dayKey(m.created_at);
    const key = `${m.wsp}::${m.material_code}`;
    let dayMap = perKeyDay.get(key);
    if (!dayMap) {
      dayMap = new Map();
      perKeyDay.set(key, dayMap);
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

  // For each (wsp, material) key, walk days in chronological order and
  // carry the closing balance forward as the next day's opening. This is
  // the cumulative running stock — it does NOT reset per date.
  const keys = Array.from(perKeyDay.keys()).sort();
  for (const key of keys) {
    const code = key.split("::")[1];
    const dayMap = perKeyDay.get(key)!;
    const days = Array.from(dayMap.keys()).sort(); // ascending by date
    let running = 0; // cumulative closing carried across days
    for (const day of days) {
      const agg = dayMap.get(day)!;
      const opening = running; // previous day's closing
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
      running = closing; // carry forward to next day
    }
  }

  // Sort ledger by date desc, then material_code for readability
  ledgerRows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.material_code.localeCompare(b.material_code);
  });

  // -------------------------------------------------------------
  // Sheet 3: Current Stock (per material)
  //   current_stock = total received - total dispatched (cumulative)
  //   Derived from the same running balance used by the ledger so
  //   it always matches the WSP Stock Overview in the app.
  // -------------------------------------------------------------
  // Compute latest cumulative closing per (wsp, material), then sum
  // across WSPs to get current stock per material.
  const currentByMaterial = new Map<string, number>();
  for (const [key, dayMap] of perKeyDay.entries()) {
    const days = Array.from(dayMap.keys()).sort();
    let running = 0;
    for (const day of days) {
      const agg = dayMap.get(day)!;
      running = running + agg.received - agg.dispatched;
    }
    const code = key.split("::")[1];
    currentByMaterial.set(code, (currentByMaterial.get(code) ?? 0) + running);
  }

  const currentStockRows = Array.from(currentByMaterial.entries())
    .map(([code, qty]) => ({
      material_code: code,
      material_name: matMap.get(code) ?? "",
      current_stock: qty,
    }))
    .sort((a, b) => a.material_code.localeCompare(b.material_code));

  // -------------------------------------------------------------
  // Build workbook
  // -------------------------------------------------------------
  const wb = XLSX.utils.book_new();

  // Dispatch Log with View Proof hyperlink column
  const dispatchHeader = [
    "date",
    "wd_code",
    "wd_name",
    "material_code",
    "material_name",
    "quantity",
    "proof",
  ];
  const dispatchAoa: (string | number)[][] = [
    dispatchHeader,
    ...dispatchRows.map((r) => [
      r.date,
      r.wd_code,
      r.wd_name,
      r.material_code,
      r.material_name,
      r.quantity,
      r.proof_url ? "View Proof" : "",
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(dispatchAoa);
  dispatchRows.forEach((r, i) => {
    if (!r.proof_url) return;
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 6 });
    ws1[cellRef] = {
      t: "s",
      v: "View Proof",
      f: `HYPERLINK("${r.proof_url.replace(/"/g, '""')}","View Proof")`,
    };
  });
  ws1["!cols"] = [
    { wch: 18 },
    { wch: 10 },
    { wch: 36 },
    { wch: 14 },
    { wch: 36 },
    { wch: 10 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Dispatch Log");

  // Receive Log with PO/invoice details + age + closing balance + proof link
  const receiveHeader = [
    "date",
    "wsp",
    "material_code",
    "material_name",
    "invoice_number",
    "batch_type",
    "received_date",
    "current_date",
    "age_days",
    "quantity",
    "closing_quantity",
    "proof",
  ];
  const proofColIdx = receiveHeader.length - 1;
  const receiveAoa: (string | number)[][] = [
    receiveHeader,
    ...receiveRows.map((r) => [
      r.date,
      r.wsp,
      r.material_code,
      r.material_name,
      r.invoice_number,
      r.batch_type,
      r.received_date,
      r.current_date,
      r.age_days,
      r.quantity,
      r.closing_quantity,
      r.proof_url ? "View Proof" : "",
    ]),
  ];
  const wsR = XLSX.utils.aoa_to_sheet(receiveAoa);
  receiveRows.forEach((r, i) => {
    if (!r.proof_url) return;
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: proofColIdx });
    wsR[cellRef] = {
      t: "s",
      v: "View Proof",
      f: `HYPERLINK("${r.proof_url.replace(/"/g, '""')}","View Proof")`,
    };
  });
  wsR["!cols"] = [
    { wch: 18 }, // date
    { wch: 8 },  // wsp
    { wch: 14 }, // material_code
    { wch: 36 }, // material_name
    { wch: 18 }, // invoice_number
    { wch: 12 }, // batch_type
    { wch: 13 }, // received_date
    { wch: 13 }, // current_date
    { wch: 10 }, // age_days
    { wch: 10 }, // quantity
    { wch: 16 }, // closing_quantity
    { wch: 14 }, // proof
  ];
  XLSX.utils.book_append_sheet(wb, wsR, "Receive Log");

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

  const ws3 = XLSX.utils.json_to_sheet(currentStockRows, {
    header: ["material_code", "material_name", "current_stock"],
  });
  ws3["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Current Stock");

  const filename = `POSM_WSP_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);

  return {
    rows: dispatchRows.length,
    ledgerRows: ledgerRows.length,
    currentStockRows: currentStockRows.length,
    filename,
  };
}
