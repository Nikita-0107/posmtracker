import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TlHoldingRow = {
  tl_name: string;
  tl_code: string;
  wd_code: string;
  section: string;
  material_code: string;
  material_name: string;
  qty_received: number;
  first_received_date: string | null;
  qty_used: number;
  qty_returned: number;
  current_qty_held: number;
  last_activity_date: string | null;
  days_since_last_activity: number | null;
};

export const getTlHoldingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Super Admin gate
    const { data: roles, error: re } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (re) throw new Error(re.message);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Forbidden: Super Admin only");
    }

    const [tlsRes, issRes, itemsRes, usagesRes, returnsRes, uploadsRes, matsRes, hierRes] =
      await Promise.all([
        supabaseAdmin.from("wd_tls").select("id, user_id, wd_code, tl_name, tl_type, legacy_tl_id"),
        supabaseAdmin.from("tl_issuances").select("id, wd_code, wd_tl_id, tl_user_id, issue_date, created_at"),
        supabaseAdmin.from("tl_issuance_items").select("id, issuance_id, material_code, qty_issued, qty_used, created_at"),
        supabaseAdmin.from("tl_usages").select("wd_tl_id, material_code, qty, created_at"),
        supabaseAdmin.from("tl_returns").select("wd_tl_id, material_code, qty, created_at"),
        supabaseAdmin.from("tl_uploads").select("issuance_item_id, qty, created_at"),
        supabaseAdmin.from("materials").select("code, name"),
        supabaseAdmin.from("hierarchy_tl").select("tl_id, tl_name, wd_code"),
      ]);

    for (const r of [tlsRes, issRes, itemsRes, usagesRes, returnsRes, uploadsRes, matsRes, hierRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const tls = tlsRes.data ?? [];
    const issuances = issRes.data ?? [];
    const items = itemsRes.data ?? [];
    const usages = usagesRes.data ?? [];
    const returns = returnsRes.data ?? [];
    const uploads = uploadsRes.data ?? [];
    const mats = matsRes.data ?? [];
    const hier = hierRes.data ?? [];

    const matName = new Map(mats.map((m) => [m.code, m.name]));
    const hierTlId = new Map(
      hier.map((h) => [`${h.wd_code}::${h.tl_name.toLowerCase()}`, h.tl_id]),
    );

    // Resolve every issuance -> wd_tl_id (fall back to user_id mapping)
    const tlByUser = new Map<string, string>();
    for (const t of tls) if (t.user_id) tlByUser.set(t.user_id, t.id);
    const issToTl = new Map<string, string | null>();
    const issMeta = new Map<string, { issue_date: string; created_at: string }>();
    for (const i of issuances) {
      const tlId = i.wd_tl_id ?? (i.tl_user_id ? tlByUser.get(i.tl_user_id) ?? null : null);
      issToTl.set(i.id, tlId);
      issMeta.set(i.id, { issue_date: i.issue_date, created_at: i.created_at });
    }

    type Agg = {
      qty_received: number;
      qty_used: number;
      qty_returned: number;
      first_received: string | null;
      last_activity: string | null;
    };
    const key = (tlId: string, mat: string) => `${tlId}::${mat}`;
    const agg = new Map<string, Agg>();
    const get = (k: string): Agg => {
      let a = agg.get(k);
      if (!a) {
        a = { qty_received: 0, qty_used: 0, qty_returned: 0, first_received: null, last_activity: null };
        agg.set(k, a);
      }
      return a;
    };
    const bumpActivity = (a: Agg, ts: string | null) => {
      if (!ts) return;
      if (!a.last_activity || ts > a.last_activity) a.last_activity = ts;
    };

    // Issuances → qty_received + first_received
    const itemToIss = new Map<string, string>();
    for (const it of items) {
      itemToIss.set(it.id, it.issuance_id);
      const tlId = issToTl.get(it.issuance_id);
      if (!tlId) continue;
      const meta = issMeta.get(it.issuance_id);
      const a = get(key(tlId, it.material_code));
      a.qty_received += it.qty_issued;
      const d = meta?.issue_date ?? null;
      if (d && (!a.first_received || d < a.first_received)) a.first_received = d;
      bumpActivity(a, meta?.created_at ?? null);
    }

    // Usages → qty_used
    for (const u of usages) {
      const a = get(key(u.wd_tl_id, u.material_code));
      a.qty_used += u.qty;
      bumpActivity(a, u.created_at);
    }

    // tl_uploads (legacy/v1 usage proof) — also count as usage when item maps to a TL
    for (const up of uploads) {
      const issId = itemToIss.get(up.issuance_item_id);
      if (!issId) continue;
      const tlId = issToTl.get(issId);
      if (!tlId) continue;
      const item = items.find((it) => it.id === up.issuance_item_id);
      if (!item) continue;
      // Only add as "used" if tl_usages doesn't already cover it (v1 path).
      // Heuristic: if no tl_usages exist for this tl+material, count uploads.
      const k = key(tlId, item.material_code);
      bumpActivity(get(k), up.created_at);
    }
    // Account for legacy v1 used qty from tl_issuance_items.qty_used when no tl_usages exist for that pair
    const v2Pairs = new Set(usages.map((u) => key(u.wd_tl_id, u.material_code)));
    for (const it of items) {
      if (it.qty_used <= 0) continue;
      const tlId = issToTl.get(it.issuance_id);
      if (!tlId) continue;
      const k = key(tlId, it.material_code);
      if (v2Pairs.has(k)) continue; // already counted via tl_usages
      get(k).qty_used += it.qty_used;
    }

    // Returns → qty_returned
    for (const r of returns) {
      const a = get(key(r.wd_tl_id, r.material_code));
      a.qty_returned += r.qty;
      bumpActivity(a, r.created_at);
    }

    const tlById = new Map(tls.map((t) => [t.id, t]));
    const today = new Date();
    const rows: TlHoldingRow[] = [];
    for (const [k, a] of agg.entries()) {
      const [tlId, material_code] = k.split("::");
      const tl = tlById.get(tlId);
      if (!tl) continue;
      const current = a.qty_received - a.qty_used - a.qty_returned;
      let days: number | null = null;
      if (a.last_activity) {
        const diff = (today.getTime() - new Date(a.last_activity).getTime()) / 86400000;
        days = Math.max(0, Math.floor(diff));
      }
      rows.push({
        tl_name: tl.tl_name,
        tl_code: tl.legacy_tl_id != null ? String(tl.legacy_tl_id) : "",
        wd_code: tl.wd_code ?? "",
        section: tl.tl_type ?? "",
        material_code,
        material_name: matName.get(material_code) ?? "",
        qty_received: a.qty_received,
        first_received_date: a.first_received,
        qty_used: a.qty_used,
        qty_returned: a.qty_returned,
        current_qty_held: current,
        last_activity_date: a.last_activity ? a.last_activity.slice(0, 10) : null,
        days_since_last_activity: days,
      });
    }

    rows.sort(
      (a, b) =>
        a.wd_code.localeCompare(b.wd_code) ||
        a.tl_name.localeCompare(b.tl_name) ||
        a.material_code.localeCompare(b.material_code),
    );
    return rows;
  });
