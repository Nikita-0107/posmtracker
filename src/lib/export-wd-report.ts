import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const INACTIVITY_DAYS = 7;

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}
function todayStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function tlLabel(t: { tl_name: string; legacy_tl_id: number | null; tl_type: string | null }) {
  const meta = [t.legacy_tl_id, t.tl_type].filter(Boolean).join(" • ");
  return meta ? `${t.tl_name} (${meta})` : t.tl_name;
}

export async function exportWdReport(wdCode: string) {
  const [matsRes, stockRes, tlsRes, issRes, retRes, trRes, trItRes, snapsRes] = await Promise.all([
    supabase.from("materials").select("code, name"),
    supabase.from("wd_stock").select("material_code, qty, updated_at").eq("wd_code", wdCode),
    supabase
      .from("wd_tls")
      .select("id, tl_name, legacy_tl_id, tl_type")
      .eq("wd_code", wdCode),
    supabase
      .from("tl_issuances")
      .select("id, wd_tl_id, created_at, issue_date")
      .eq("wd_code", wdCode),
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tl_returns" as any)
      .select("wd_tl_id, material_code, qty, created_at")
      .eq("wd_code", wdCode),
    supabase
      .from("wd_transfers")
      .select("id, from_wd_code, to_wd_code, status, created_at, completed_at")
      .or(`from_wd_code.eq.${wdCode},to_wd_code.eq.${wdCode}`),
    supabase.from("wd_transfer_items").select(
      "transfer_id, material_code, qty_requested, qty_confirmed, item_status",
    ),
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("wd_stock_snapshots" as any)
      .select("material_code, qty_counted, qty_previous, qty_change, note, snapshot_date, created_at")
      .eq("wd_code", wdCode)
      .order("created_at", { ascending: false }),
  ]);

  const materials = (matsRes.data ?? []) as { code: string; name: string }[];
  const matName = new Map(materials.map((m) => [m.code, m.name]));

  const stock = (stockRes.data ?? []) as {
    material_code: string;
    qty: number;
    updated_at: string;
  }[];
  const tls = (tlsRes.data ?? []) as {
    id: string;
    tl_name: string;
    legacy_tl_id: number | null;
    tl_type: string | null;
  }[];
  const issuances = (issRes.data ?? []) as {
    id: string;
    wd_tl_id: string | null;
    created_at: string;
    issue_date: string;
  }[];
  const issIds = issuances.map((i) => i.id);
  const itemsRes = issIds.length
    ? await supabase
        .from("tl_issuance_items")
        .select("issuance_id, material_code, qty_issued, created_at")
        .in("issuance_id", issIds)
    : { data: [] as { issuance_id: string; material_code: string; qty_issued: number; created_at: string }[] };
  const issItems = (itemsRes.data ?? []) as {
    issuance_id: string;
    material_code: string;
    qty_issued: number;
    created_at: string;
  }[];
  const returns = (retRes.data ?? []) as unknown as {
    wd_tl_id: string;
    material_code: string;
    qty: number;
    created_at: string;
  }[];
  const transfers = (trRes.data ?? []) as {
    id: string;
    from_wd_code: string;
    to_wd_code: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }[];
  const trItemsAll = (trItRes.data ?? []) as {
    transfer_id: string;
    material_code: string;
    qty_requested: number;
    qty_confirmed: number | null;
    item_status: string;
  }[];
  const snaps = (snapsRes.data ?? []) as unknown as {
    material_code: string;
    qty_counted: number;
    qty_previous: number | null;
    qty_change: number | null;
    note: string | null;
    snapshot_date: string;
    created_at: string;
  }[];

  // In-transit OUT (pending outgoing transfers)
  const pendingOutTransferIds = new Set(
    transfers.filter((t) => t.from_wd_code === wdCode && t.status === "pending").map((t) => t.id),
  );
  const inTransitByMat = new Map<string, number>();
  for (const it of trItemsAll) {
    if (!pendingOutTransferIds.has(it.transfer_id)) continue;
    inTransitByMat.set(
      it.material_code,
      (inTransitByMat.get(it.material_code) ?? 0) + (it.qty_requested ?? 0),
    );
  }

  const issIdToTl = new Map(issuances.map((i) => [i.id, i.wd_tl_id]));
  const issIdToCreated = new Map(issuances.map((i) => [i.id, i.created_at]));
  const tlById = new Map(tls.map((t) => [t.id, t]));

  // ===== Sheet a: Stock Summary =====
  const stockRows = stock
    .map((s) => {
      const transit = inTransitByMat.get(s.material_code) ?? 0;
      return {
        material_code: s.material_code,
        material_name: matName.get(s.material_code) ?? "",
        system_stock: s.qty,
        in_transit: transit,
        available_stock: Math.max(0, s.qty - transit),
        last_updated: fmtDateTime(s.updated_at),
      };
    })
    .sort((a, b) => a.material_code.localeCompare(b.material_code));

  // ===== Sheet b: TL Summary =====
  const tlAlloc = new Map<string, number>();
  const tlLastAlloc = new Map<string, string>();
  for (const it of issItems) {
    const tlId = issIdToTl.get(it.issuance_id);
    if (!tlId) continue;
    tlAlloc.set(tlId, (tlAlloc.get(tlId) ?? 0) + it.qty_issued);
    const ts = issIdToCreated.get(it.issuance_id) ?? "";
    if (!tlLastAlloc.get(tlId) || ts > tlLastAlloc.get(tlId)!) tlLastAlloc.set(tlId, ts);
  }
  const tlRet = new Map<string, number>();
  const tlLastRet = new Map<string, string>();
  for (const r of returns) {
    tlRet.set(r.wd_tl_id, (tlRet.get(r.wd_tl_id) ?? 0) + r.qty);
    if (!tlLastRet.get(r.wd_tl_id) || r.created_at > tlLastRet.get(r.wd_tl_id)!)
      tlLastRet.set(r.wd_tl_id, r.created_at);
  }
  const tlSummaryRows = tls
    .map((t) => {
      const allocated = tlAlloc.get(t.id) ?? 0;
      const returned = tlRet.get(t.id) ?? 0;
      const lastAlloc = tlLastAlloc.get(t.id) ?? "";
      const lastRet = tlLastRet.get(t.id) ?? "";
      const last = lastAlloc > lastRet ? lastAlloc : lastRet;
      const days = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : Infinity;
      return {
        tl: tlLabel(t),
        total_allocated: allocated,
        total_returned: returned,
        pending: Math.max(0, allocated - returned),
        last_activity: last ? fmtDateTime(last) : "",
        status: days >= INACTIVITY_DAYS ? "Inactive" : "Active",
      };
    })
    .sort((a, b) => a.tl.localeCompare(b.tl));

  // ===== Sheet c: Allocation Log =====
  const allocLog = issItems
    .map((it) => {
      const tlId = issIdToTl.get(it.issuance_id);
      const tl = tlId ? tlById.get(tlId) : null;
      return {
        date: fmtDateTime(issIdToCreated.get(it.issuance_id) ?? it.created_at),
        tl: tl ? tlLabel(tl) : "",
        material_code: it.material_code,
        material_name: matName.get(it.material_code) ?? "",
        quantity_allocated: it.qty_issued,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // ===== Sheet d: Return Log =====
  const returnLog = returns
    .map((r) => {
      const tl = tlById.get(r.wd_tl_id);
      return {
        date: fmtDateTime(r.created_at),
        tl: tl ? tlLabel(tl) : "",
        material_code: r.material_code,
        material_name: matName.get(r.material_code) ?? "",
        quantity_returned: r.qty,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // ===== Sheet e: Transfer Log =====
  const trItemsByTransfer = new Map<string, typeof trItemsAll>();
  for (const it of trItemsAll) {
    const list = trItemsByTransfer.get(it.transfer_id) ?? [];
    list.push(it);
    trItemsByTransfer.set(it.transfer_id, list);
  }
  const transferLog: {
    date: string;
    from_wd: string;
    to_wd: string;
    material_code: string;
    material_name: string;
    quantity: number;
    status: string;
  }[] = [];
  for (const t of transfers) {
    const items = trItemsByTransfer.get(t.id) ?? [];
    for (const it of items) {
      transferLog.push({
        date: fmtDateTime(t.created_at),
        from_wd: t.from_wd_code,
        to_wd: t.to_wd_code,
        material_code: it.material_code,
        material_name: matName.get(it.material_code) ?? "",
        quantity: it.qty_confirmed ?? it.qty_requested,
        status: `${t.status}${it.item_status ? ` / ${it.item_status}` : ""}`,
      });
    }
  }
  transferLog.sort((a, b) => (a.date < b.date ? 1 : -1));

  // ===== Sheet f: Stock Update History =====
  const historyRows = snaps.map((s) => ({
    date: fmtDate(s.snapshot_date) || fmtDateTime(s.created_at),
    material_code: s.material_code,
    material_name: matName.get(s.material_code) ?? "",
    system_stock: s.qty_previous ?? "",
    physical_stock: s.qty_counted,
    difference: s.qty_change ?? "",
    remarks: s.note ?? "",
  }));

  // Build workbook
  const wb = XLSX.utils.book_new();

  const addSheet = (
    name: string,
    rows: Record<string, string | number>[],
    header: string[],
    widths: number[],
  ) => {
    const aoa: (string | number)[][] = [
      header,
      ...rows.map((r) => header.map((h) => (r[h] ?? "") as string | number)),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet(
    "Stock Summary",
    stockRows,
    ["material_code", "material_name", "system_stock", "in_transit", "available_stock", "last_updated"],
    [14, 36, 14, 12, 16, 18],
  );
  addSheet(
    "TL Summary",
    tlSummaryRows,
    ["tl", "total_allocated", "total_returned", "pending", "last_activity", "status"],
    [38, 16, 16, 12, 18, 12],
  );
  addSheet(
    "Allocation Log",
    allocLog,
    ["date", "tl", "material_code", "material_name", "quantity_allocated"],
    [18, 38, 14, 36, 18],
  );
  addSheet(
    "Return Log",
    returnLog,
    ["date", "tl", "material_code", "material_name", "quantity_returned"],
    [18, 38, 14, 36, 18],
  );
  addSheet(
    "Transfer Log",
    transferLog,
    ["date", "from_wd", "to_wd", "material_code", "material_name", "quantity", "status"],
    [18, 12, 12, 14, 36, 10, 22],
  );
  addSheet(
    "Stock Update History",
    historyRows,
    ["date", "material_code", "material_name", "system_stock", "physical_stock", "difference", "remarks"],
    [13, 14, 36, 14, 14, 12, 32],
  );

  const filename = `WD_${wdCode}_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { filename };
}
