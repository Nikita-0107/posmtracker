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
  invoice_file_path: string | null;
  received_date: string | null;
  batch_type: string | null;
  dispatch_id: string | null;
  dispatch_date: string | null;
  item_status: string | null;
  issue_note: string | null;
  resolved_at: string | null;
  confirmed_at: string | null;
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

/** Map raw item_status (+ ancillary fields) into a human-readable label. */
function statusLabel(m: MovementRow): string {
  const s = (m.item_status ?? "").toLowerCase();
  if (s === "closed_loss") return "closed_loss";
  if (s === "closed_resolved" || s === "resolved") return "closed_resolved";
  if (s === "open_issue" || s === "issue_open" || s === "open") return "open_issue";
  if (s === "delivered" || s === "confirmed") return "delivered";
  if (m.confirmed_at) return "delivered";
  if (m.issue_note && !m.resolved_at) return "open_issue";
  return "pending";
}

export async function exportDispatchReport() {
  const [movementsRes, materialsRes] = await Promise.all([
    supabase
      .from("stock_movements")
      .select(
        "created_at, material_code, qty, movement, distributor, wsp, reference_number, proof_image_path, invoice_file_path, received_date, batch_type, dispatch_id, dispatch_date, item_status, issue_note, resolved_at, confirmed_at",
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

  // Sign all proof image + invoice file paths in one batch
  const allSignedPaths = [
    ...movements.map((m) => m.proof_image_path),
    ...movements.map((m) => m.invoice_file_path),
  ].filter((p): p is string => !!p);
  const signedMap = await signProofPaths(allSignedPaths);

  // -------------------------------------------------------------
  // Sheet 1: Dispatch Log (now with status / issue_note / closed_at)
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
        wsp_name: m.wsp,
        wd_code: wd.code,
        wd_name: wd.name,
        material_code: m.material_code,
        material_name: matMap.get(m.material_code) ?? "",
        quantity: m.qty,
        status: statusLabel(m),
        issue_note: m.issue_note ?? "",
        closed_at: m.resolved_at ? formatDateTime(m.resolved_at) : "",
        proof_url: proofUrl,
      };
    });

  // -------------------------------------------------------------
  // Losses (subset of dispatches) — used for both the Losses sheet
  // and the per-material lost totals on the Current Stock sheet.
  // -------------------------------------------------------------
  const lossRows = dispatchRows
    .filter((r) => r.status === "closed_loss")
    .slice()
    .sort((a, b) => {
      const ax = a.closed_at || a.date;
      const bx = b.closed_at || b.date;
      return ax < bx ? 1 : -1;
    });

  // -------------------------------------------------------------
  // Receive Log (unchanged)
  // -------------------------------------------------------------
  const receives = movements.filter(
    (m) => m.movement === "receive" && m.material_code && m.qty > 0,
  );

  const runningBalance = new Map<string, number>();
  const receiveClosingByMovement = new Map<string, number>();
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
      const invoiceUrl = m.invoice_file_path ? signedMap.get(m.invoice_file_path) ?? "" : "";
      const rdate = m.received_date ?? "";
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
        invoice_url: invoiceUrl,
        proof_url: proofUrl,
      };
    });

  // -------------------------------------------------------------
  // WSP Stock Ledger — split dispatched_to_WD vs lost
  // -------------------------------------------------------------
  type DayAgg = { received: number; dispatched: number; lost: number };
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
      agg = { received: 0, dispatched: 0, lost: 0 };
      dayMap.set(day, agg);
    }
    if (m.movement === "receive") {
      agg.received += m.qty;
    } else if (m.movement === "dispatch") {
      if ((m.item_status ?? "").toLowerCase() === "closed_loss") agg.lost += m.qty;
      else agg.dispatched += m.qty;
    }
  }

  // In Transit to WD — sum of dispatch qty where item_status = 'pending'
  // (mirrors the WSP Stock UI logic exactly). Computed before ledger build
  // so both the ledger and Current Stock sheets can use it.
  const inTransitByMaterial = new Map<string, number>();
  const inTransitByWspMaterial = new Map<string, number>();
  for (const m of movements) {
    if (m.movement !== "dispatch") continue;
    if (!m.material_code || m.qty <= 0) continue;
    if ((m.item_status ?? "").toLowerCase() !== "pending") continue;
    inTransitByMaterial.set(
      m.material_code,
      (inTransitByMaterial.get(m.material_code) ?? 0) + m.qty,
    );
    const k = `${m.wsp}::${m.material_code}`;
    inTransitByWspMaterial.set(k, (inTransitByWspMaterial.get(k) ?? 0) + m.qty);
  }

  const ledgerRows: {
    date: string;
    material_code: string;
    material_name: string;
    opening_quantity: number;
    received_from_HO: number;
    dispatched_to_WD: number;
    lost: number;
    available_at_wsp: number;
    in_transit_to_wd: number;
    total_stock: number;
  }[] = [];

  const keys = Array.from(perKeyDay.keys()).sort();
  for (const key of keys) {
    const code = key.split("::")[1];
    const dayMap = perKeyDay.get(key)!;
    const days = Array.from(dayMap.keys()).sort();
    let running = 0;
    for (const day of days) {
      const agg = dayMap.get(day)!;
      const opening = running;
      const closing = opening + agg.received - agg.dispatched - agg.lost;
      ledgerRows.push({
        date: day,
        material_code: code,
        material_name: matMap.get(code) ?? "",
        opening_quantity: opening,
        received_from_HO: agg.received,
        dispatched_to_WD: agg.dispatched,
        lost: agg.lost,
        // placeholders — overwritten for the latest row per key below
        available_at_wsp: closing,
        in_transit_to_wd: 0,
        total_stock: closing,
      });
      running = closing;
    }
    // Patch the most recent row for this (wsp, material) with live in-transit
    const lastRow = ledgerRows[ledgerRows.length - 1];
    const transit = inTransitByWspMaterial.get(key) ?? 0;
    const total = running;
    const available = Math.max(0, total - transit);
    lastRow.available_at_wsp = available;
    lastRow.in_transit_to_wd = transit;
    lastRow.total_stock = available + transit;
  }

  ledgerRows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.material_code.localeCompare(b.material_code);
  });

  // (in-transit maps already computed above, before ledger build)
  // -------------------------------------------------------------
  // Current Stock — add total_lost reference column
  // total_stock here = on-hand running balance (already nets out dispatches),
  // so Available at WSP = total_stock - in_transit, and the UI's "Total"
  // chip = Available + In Transit = total_stock.
  // -------------------------------------------------------------
  const currentByMaterial = new Map<string, number>();
  const lostByMaterial = new Map<string, number>();
  for (const [key, dayMap] of perKeyDay.entries()) {
    const days = Array.from(dayMap.keys()).sort();
    let running = 0;
    let lost = 0;
    for (const day of days) {
      const agg = dayMap.get(day)!;
      running = running + agg.received - agg.dispatched - agg.lost;
      lost += agg.lost;
    }
    const code = key.split("::")[1];
    currentByMaterial.set(code, (currentByMaterial.get(code) ?? 0) + running);
    lostByMaterial.set(code, (lostByMaterial.get(code) ?? 0) + lost);
  }

  const currentStockRows = Array.from(currentByMaterial.entries())
    .map(([code, total]) => {
      const transit = inTransitByMaterial.get(code) ?? 0;
      const available = Math.max(0, total - transit);
      return {
        material_code: code,
        material_name: matMap.get(code) ?? "",
        available_at_wsp: available,
        in_transit_to_wd: transit,
        total_stock: available + transit,
        total_lost: lostByMaterial.get(code) ?? 0,
      };
    })
    .sort((a, b) => a.material_code.localeCompare(b.material_code));

  // -------------------------------------------------------------
  // Build workbook
  // -------------------------------------------------------------
  const wb = XLSX.utils.book_new();

  // ----- Dispatch Log -----
  const dispatchHeader = [
    "date",
    "dispatch_date",
    "dispatch_id",
    "wsp_name",
    "wd_code",
    "wd_name",
    "material_code",
    "material_name",
    "quantity",
    "status",
    "issue_note",
    "closed_at",
    "proof",
  ];
  const dispatchProofCol = dispatchHeader.length - 1;
  const dispatchAoa: (string | number)[][] = [
    dispatchHeader,
    ...dispatchRows.map((r) => [
      r.date,
      r.dispatch_date,
      r.dispatch_id,
      r.wsp_name,
      r.wd_code,
      r.wd_name,
      r.material_code,
      r.material_name,
      r.quantity,
      r.status,
      r.issue_note,
      r.closed_at,
      r.proof_url ? "View Proof" : "",
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(dispatchAoa);
  dispatchRows.forEach((r, i) => {
    if (!r.proof_url) return;
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: dispatchProofCol });
    ws1[cellRef] = {
      t: "s",
      v: "View Proof",
      l: { Target: r.proof_url, Tooltip: "Open proof" },
    };
  });
  ws1["!cols"] = [
    { wch: 18 }, // date
    { wch: 13 }, // dispatch_date
    { wch: 36 }, // dispatch_id
    { wch: 10 }, // wsp_name
    { wch: 10 }, // wd_code
    { wch: 36 }, // wd_name
    { wch: 14 }, // material_code
    { wch: 36 }, // material_name
    { wch: 10 }, // quantity
    { wch: 16 }, // status
    { wch: 32 }, // issue_note
    { wch: 18 }, // closed_at
    { wch: 14 }, // proof
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Dispatch Log");

  // ----- Losses sheet -----
  const lossHeader = [
    "loss_date",
    "dispatch_date",
    "dispatch_id",
    "wsp",
    "wd_code",
    "wd_name",
    "material_code",
    "material_name",
    "quantity_lost",
    "issue_note",
    "proof",
  ];
  const lossProofCol = lossHeader.length - 1;
  const totalLostUnits = lossRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const lossAoa: (string | number)[][] = [
    lossHeader,
    ...lossRows.map((r) => [
      r.closed_at || r.date,
      r.dispatch_date,
      r.dispatch_id,
      r.wsp_name,
      r.wd_code,
      r.wd_name,
      r.material_code,
      r.material_name,
      r.quantity,
      r.issue_note,
      r.proof_url ? "View Proof" : "",
    ]),
    [],
    ["TOTAL", "", "", "", "", "", "", `${lossRows.length} loss events`, totalLostUnits, "", ""],
  ];
  const wsL = XLSX.utils.aoa_to_sheet(lossAoa);
  lossRows.forEach((r, i) => {
    if (!r.proof_url) return;
    const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: lossProofCol });
    wsL[cellRef] = {
      t: "s",
      v: "View Proof",
      l: { Target: r.proof_url, Tooltip: "Open proof" },
    };
  });
  wsL["!cols"] = [
    { wch: 18 }, // loss_date
    { wch: 13 }, // dispatch_date
    { wch: 36 }, // dispatch_id
    { wch: 10 }, // wsp
    { wch: 10 }, // wd_code
    { wch: 36 }, // wd_name
    { wch: 14 }, // material_code
    { wch: 36 }, // material_name
    { wch: 14 }, // quantity_lost
    { wch: 40 }, // issue_note
    { wch: 14 }, // proof
  ];
  XLSX.utils.book_append_sheet(wb, wsL, "Losses");

  // ----- Receive Log -----
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
    "available_at_wsp",
    "in_transit_to_wd",
    "total_stock",
    "invoice_file",
    "proof",
  ];
  const invoiceColIdx = receiveHeader.length - 2;
  const proofColIdxR = receiveHeader.length - 1;
  // Mark the latest receive row per (wsp, material) so it shows live
  // Available / In Transit / Total Stock that match the app UI exactly.
  // receiveRows is sorted DESC by created_at, so the FIRST occurrence wins.
  const latestReceiveIdx = new Map<string, number>();
  receiveRows.forEach((r, i) => {
    const k = `${r.wsp}::${r.material_code}`;
    if (!latestReceiveIdx.has(k)) latestReceiveIdx.set(k, i);
  });
  const receiveAoa: (string | number)[][] = [
    receiveHeader,
    ...receiveRows.map((r, i) => {
      const k = `${r.wsp}::${r.material_code}`;
      const isLatest = latestReceiveIdx.get(k) === i;
      const transit = isLatest ? inTransitByWspMaterial.get(k) ?? 0 : 0;
      const total = isLatest ? r.closing_quantity : r.closing_quantity;
      const available = isLatest ? Math.max(0, total - transit) : r.closing_quantity;
      return [
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
        available,
        transit,
        available + transit,
        r.invoice_url ? "View Invoice" : "",
        r.proof_url ? "View Proof" : "",
      ];
    }),
  ];
  const wsR = XLSX.utils.aoa_to_sheet(receiveAoa);
  receiveRows.forEach((r, i) => {
    if (r.invoice_url) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: invoiceColIdx });
      wsR[cellRef] = {
        t: "s",
        v: "View Invoice",
        l: { Target: r.invoice_url, Tooltip: "Open invoice" },
      };
    }
    if (r.proof_url) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: proofColIdxR });
      wsR[cellRef] = {
        t: "s",
        v: "View Proof",
        l: { Target: r.proof_url, Tooltip: "Open proof" },
      };
    }
  });
  wsR["!cols"] = [
    { wch: 18 },
    { wch: 8 },
    { wch: 14 },
    { wch: 36 },
    { wch: 18 },
    { wch: 12 },
    { wch: 13 },
    { wch: 13 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 }, // available_at_wsp
    { wch: 18 }, // in_transit_to_wd
    { wch: 14 }, // total_stock
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsR, "Receive Log");

  // ----- WSP Stock Ledger -----
  const ws2 = XLSX.utils.json_to_sheet(ledgerRows, {
    header: [
      "date",
      "material_code",
      "material_name",
      "opening_quantity",
      "received_from_HO",
      "dispatched_to_WD",
      "lost",
      "available_at_wsp",
      "in_transit_to_wd",
      "total_stock",
    ],
  });
  ws2["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "WSP Stock Ledger");

  // ----- Current Stock -----
  const ws3 = XLSX.utils.json_to_sheet(currentStockRows, {
    header: [
      "material_code",
      "material_name",
      "available_at_wsp",
      "in_transit_to_wd",
      "total_stock",
      "total_lost",
    ],
  });
  ws3["!cols"] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Current Stock");

  const filename = `POSM_WSP_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);

  return {
    rows: dispatchRows.length,
    lossRows: lossRows.length,
    ledgerRows: ledgerRows.length,
    currentStockRows: currentStockRows.length,
    filename,
  };
}
