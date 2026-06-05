import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

type Cell = string | number;

export async function exportWdReport(wdCode: string) {
  const monthStart = monthStartIso();

  const [matsRes, stockRes, tlsRes, hierTlsRes, issRes, retRes, trRes, trItRes, receivedRes, inactRes] =
    await Promise.all([
      supabase.from("materials").select("code, name"),
      supabase.from("wd_stock").select("material_code, qty, updated_at").eq("wd_code", wdCode),
      supabase
        .from("wd_tls")
        .select("id, tl_name, legacy_tl_id, tl_type")
        .eq("wd_code", wdCode),
      supabase
        .from("hierarchy_tl")
        .select("tl_id, tl_name, active")
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
      // Stock received by this WD this month (confirmed WSP dispatches)
      supabase
        .from("stock_movements")
        .select("material_code, qty, confirmed_at, item_status")
        .eq("movement", "dispatch")
        .eq("distributor", wdCode)
        .eq("item_status", "received")
        .gte("confirmed_at", monthStart),
      supabase
        .from("tl_inactivity_reasons")
        .select("wd_tl_id, reason, leave_until, expires_at, created_at")
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
        .select("issuance_id, material_code, qty_issued, qty_used, created_at")
        .in("issuance_id", issIds)
    : { data: [] as { issuance_id: string; material_code: string; qty_issued: number; qty_used: number; created_at: string }[] };
  const issItems = (itemsRes.data ?? []) as {
    issuance_id: string;
    material_code: string;
    qty_issued: number;
    qty_used: number;
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
  const received = (receivedRes.data ?? []) as {
    material_code: string;
    qty: number;
    confirmed_at: string | null;
    item_status: string;
  }[];

  const issIdToTl = new Map(issuances.map((i) => [i.id, i.wd_tl_id]));
  const issIdToCreated = new Map(issuances.map((i) => [i.id, i.created_at]));
  const tlById = new Map(tls.map((t) => [t.id, t]));
  const hierTls = (hierTlsRes.data ?? []) as { tl_id: string; tl_name: string; active: boolean }[];
  const hierByName = new Map(hierTls.map((h) => [h.tl_name.trim().toUpperCase(), h]));
  const tlIdFor = (t: { tl_name: string; legacy_tl_id: number | null } | undefined) => {
    if (!t) return "";
    const h = hierByName.get(t.tl_name.trim().toUpperCase());
    return h?.tl_id ?? (t.legacy_tl_id != null ? String(t.legacy_tl_id) : "");
  };

  // Inactive TL map: latest non-expired inactivity record per wd_tl_id
  const inactivity = (inactRes.data ?? []) as {
    wd_tl_id: string;
    reason: string;
    leave_until: string | null;
    expires_at: string | null;
    created_at: string;
  }[];
  const nowMs = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  const inactiveByTl = new Map<string, { reason: string; leave_until: string | null }>();
  for (const r of inactivity) {
    if (inactiveByTl.has(r.wd_tl_id)) continue; // ordered desc, keep latest
    const expOk = !r.expires_at || new Date(r.expires_at).getTime() > nowMs;
    const leaveOk = !r.leave_until || r.leave_until >= todayStr;
    if (expOk && leaveOk) {
      inactiveByTl.set(r.wd_tl_id, { reason: r.reason, leave_until: r.leave_until });
    }
  }
  const tlStatus = (tlId: string | null | undefined) =>
    tlId && inactiveByTl.has(tlId) ? "Inactive" : "Active";

  // ===== Sheet A: WD Stock Summary (monthly view) =====
  // Added Stock = received from WSP this month
  const addedByMat = new Map<string, number>();
  for (const r of received) {
    addedByMat.set(r.material_code, (addedByMat.get(r.material_code) ?? 0) + (r.qty ?? 0));
  }
  // Deducted Stock = issued to TLs this month (net of returns this month)
  const deductedByMat = new Map<string, number>();
  for (const it of issItems) {
    const ts = issIdToCreated.get(it.issuance_id) ?? it.created_at;
    if (ts < monthStart) continue;
    deductedByMat.set(
      it.material_code,
      (deductedByMat.get(it.material_code) ?? 0) + (it.qty_issued ?? 0),
    );
  }
  for (const r of returns) {
    if (r.created_at < monthStart) continue;
    deductedByMat.set(
      r.material_code,
      (deductedByMat.get(r.material_code) ?? 0) - (r.qty ?? 0),
    );
  }

  const stockRows = stock
    .map((s) => {
      const added = addedByMat.get(s.material_code) ?? 0;
      const deducted = deductedByMat.get(s.material_code) ?? 0;
      // SOH at month start = current SOH - added + deducted
      const openingSoh = s.qty - added + deducted;
      return {
        "Material Code": s.material_code,
        "Material Description": matName.get(s.material_code) ?? "",
        "SOH (Month Start)": openingSoh,
        "Added Stock (from WSP)": added,
        "Deducted Stock (to TLs)": deducted,
        "Current SOH": s.qty,
        "Last Updated": fmtDateTime(s.updated_at),
      };
    })
    .sort((a, b) => String(a["Material Code"]).localeCompare(String(b["Material Code"])));

  // ===== Sheet B: TL Movement (TL x Material live balance) =====
  type TlMatKey = string;
  const recv = new Map<TlMatKey, number>();
  const used = new Map<TlMatKey, number>();
  const ret = new Map<TlMatKey, number>();
  const last = new Map<TlMatKey, string>();
  const bump = (m: Map<TlMatKey, number>, k: TlMatKey, v: number) =>
    m.set(k, (m.get(k) ?? 0) + v);
  const touch = (k: TlMatKey, ts: string) => {
    const cur = last.get(k);
    if (!cur || ts > cur) last.set(k, ts);
  };

  for (const it of issItems) {
    const tlId = issIdToTl.get(it.issuance_id);
    if (!tlId) continue;
    const k = `${tlId}|${it.material_code}`;
    bump(recv, k, it.qty_issued);
    bump(used, k, it.qty_used);
    touch(k, issIdToCreated.get(it.issuance_id) ?? it.created_at);
  }
  for (const r of returns) {
    const k = `${r.wd_tl_id}|${r.material_code}`;
    bump(ret, k, r.qty);
    touch(k, r.created_at);
  }

  const movementKeys = new Set<TlMatKey>([...recv.keys(), ...ret.keys()]);
  const movementRows = Array.from(movementKeys)
    .map((k) => {
      const [tlId, mat] = k.split("|");
      const tl = tlById.get(tlId);
      const r = recv.get(k) ?? 0;
      const u = used.get(k) ?? 0;
      const rt = ret.get(k) ?? 0;
      return {
        "TL ID": tl?.legacy_tl_id ?? "",
        "TL Name": tl?.tl_name ?? "",
        "TL Type": tl?.tl_type ?? "",
        "TL Status": tlStatus(tlId),
        "Material Code": mat,
        "Material Description": matName.get(mat) ?? "",
        "Received Qty": r,
        "Used Qty": u,
        "Returned Qty": rt,
        "Current TL Balance": r - u - rt,
        "Last Activity": fmtDateTime(last.get(k) ?? null),
      };
    })
    .sort(
      (a, b) =>
        String(a["TL Name"]).localeCompare(String(b["TL Name"])) ||
        String(a["Material Code"]).localeCompare(String(b["Material Code"])),
    );

  // ===== Sheet C: Allocation Log =====
  const allocLog = issItems
    .map((it) => {
      const tlId = issIdToTl.get(it.issuance_id);
      const tl = tlId ? tlById.get(tlId) : null;
      return {
        Date: fmtDateTime(issIdToCreated.get(it.issuance_id) ?? it.created_at),
        "TL ID": tl?.legacy_tl_id ?? "",
        "TL Name": tl?.tl_name ?? "",
        "TL Type": tl?.tl_type ?? "",
        "TL Status": tlStatus(tlId),
        "Material Code": it.material_code,
        "Material Description": matName.get(it.material_code) ?? "",
        "Quantity Allocated": it.qty_issued,
      };
    })
    .sort((a, b) => (a.Date < b.Date ? 1 : -1));

  // ===== Sheet D: Return Log =====
  const returnLog = returns
    .map((r) => {
      const tl = tlById.get(r.wd_tl_id);
      return {
        Date: fmtDateTime(r.created_at),
        "TL ID": tl?.legacy_tl_id ?? "",
        "TL Name": tl?.tl_name ?? "",
        "TL Type": tl?.tl_type ?? "",
        "TL Status": tlStatus(r.wd_tl_id),
        "Material Code": r.material_code,
        "Material Description": matName.get(r.material_code) ?? "",
        "Quantity Returned": r.qty,
      };
    })
    .sort((a, b) => (a.Date < b.Date ? 1 : -1));

  // ===== Sheet E: Transfer Log =====
  const trItemsByTransfer = new Map<string, typeof trItemsAll>();
  for (const it of trItemsAll) {
    const list = trItemsByTransfer.get(it.transfer_id) ?? [];
    list.push(it);
    trItemsByTransfer.set(it.transfer_id, list);
  }
  const transferLog: Record<string, Cell>[] = [];
  for (const t of transfers) {
    const items = trItemsByTransfer.get(t.id) ?? [];
    const direction = t.from_wd_code === wdCode ? "OUT" : "IN";
    for (const it of items) {
      transferLog.push({
        Date: fmtDateTime(t.created_at),
        Direction: direction,
        "From WD": t.from_wd_code,
        "To WD": t.to_wd_code,
        "Material Code": it.material_code,
        "Material Description": matName.get(it.material_code) ?? "",
        Quantity: it.qty_confirmed ?? it.qty_requested,
        Status: `${t.status}${it.item_status ? ` / ${it.item_status}` : ""}`,
      });
    }
  }
  transferLog.sort((a, b) => (String(a.Date) < String(b.Date) ? 1 : -1));

  // Build workbook with formatting helper
  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, rows: Record<string, Cell>[], header: string[]) => {
    const aoa: Cell[][] = [header, ...rows.map((r) => header.map((h) => (r[h] ?? "") as Cell))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map((h, i) => {
      let max = h.length;
      for (const row of aoa.slice(1)) {
        const v = row[i];
        const len = v == null ? 0 : String(v).length;
        if (len > max) max = len;
      }
      return { wch: Math.min(40, Math.max(10, max + 2)) };
    });
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!panes"] = [{ ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" }];
    for (let c = 0; c < header.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = ws[addr];
      if (cell) {
        cell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "EEEEEE" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("WD Stock Summary", stockRows, [
    "Material Code",
    "Material Description",
    "SOH (Month Start)",
    "Added Stock (from WSP)",
    "Deducted Stock (to TLs)",
    "Current SOH",
    "Last Updated",
  ]);
  addSheet("TL Movement", movementRows, [
    "TL ID",
    "TL Name",
    "TL Type",
    "TL Status",
    "Material Code",
    "Material Description",
    "Received Qty",
    "Used Qty",
    "Returned Qty",
    "Current TL Balance",
    "Last Activity",
  ]);
  addSheet("Allocation Log", allocLog, [
    "Date",
    "TL ID",
    "TL Name",
    "TL Type",
    "TL Status",
    "Material Code",
    "Material Description",
    "Quantity Allocated",
  ]);
  addSheet("Return Log", returnLog, [
    "Date",
    "TL ID",
    "TL Name",
    "TL Type",
    "TL Status",
    "Material Code",
    "Material Description",
    "Quantity Returned",
  ]);
  addSheet("Transfer Log", transferLog, [
    "Date",
    "Direction",
    "From WD",
    "To WD",
    "Material Code",
    "Material Description",
    "Quantity",
    "Status",
  ]);

  const filename = `WD_${wdCode}_Report_${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename, { cellStyles: true });
  return { filename };
}
