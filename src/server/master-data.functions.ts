import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin")) throw new Error("Forbidden: Super Admin only");
}

async function logAudit(
  userId: string,
  entries: Array<{
    entity_type: "ae" | "wd" | "tl";
    entity_id: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
  }>,
) {
  if (entries.length === 0) return;
  const rows = entries
    .filter((e) => (e.old_value ?? "") !== (e.new_value ?? ""))
    .map((e) => ({ ...e, changed_by: userId }));
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from("master_data_audit").insert(rows);
  if (error) throw new Error(error.message);
}

// ---------- LIST ----------
export const listMasterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [ae, wd, tl, wdAssign] = await Promise.all([
      supabaseAdmin.from("hierarchy_ae").select("ae_id, ae_name, active").order("ae_id"),
      supabaseAdmin.from("hierarchy_wd").select("wd_code, wd_name, ae_id, active").order("wd_code"),
      supabaseAdmin.from("hierarchy_tl").select("tl_id, tl_name, wd_code, active").order("tl_id"),
      supabaseAdmin.from("wd_assignments").select("wd_code, wsp"),
    ]);
    if (ae.error) throw new Error(ae.error.message);
    if (wd.error) throw new Error(wd.error.message);
    if (tl.error) throw new Error(tl.error.message);
    if (wdAssign.error) throw new Error(wdAssign.error.message);

    const wspByWd = new Map<string, string[]>();
    for (const r of wdAssign.data ?? []) {
      const arr = wspByWd.get(r.wd_code) ?? [];
      arr.push(r.wsp as string);
      wspByWd.set(r.wd_code, arr);
    }
    return {
      ae: ae.data ?? [],
      wd: (wd.data ?? []).map((r) => ({ ...r, wsps: wspByWd.get(r.wd_code) ?? [] })),
      tl: tl.data ?? [],
    };
  });

// ---------- AE ----------
const aeUpdateSchema = z.object({
  ae_id: z.string().min(1),
  ae_name: z.string().min(1).max(255).optional(),
  active: z.boolean().optional(),
});

export const updateAeMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aeUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: cur, error: e1 } = await supabaseAdmin
      .from("hierarchy_ae").select("ae_name, active").eq("ae_id", data.ae_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("AE not found");

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    const audits: Parameters<typeof logAudit>[1] = [];
    if (data.ae_name !== undefined && data.ae_name !== cur.ae_name) {
      patch.ae_name = data.ae_name;
      audits.push({ entity_type: "ae", entity_id: data.ae_id, field_changed: "ae_name",
        old_value: cur.ae_name, new_value: data.ae_name });
    }
    if (data.active !== undefined && data.active !== cur.active) {
      patch.active = data.active;
      audits.push({ entity_type: "ae", entity_id: data.ae_id, field_changed: "active",
        old_value: String(cur.active), new_value: String(data.active) });
    }
    if (Object.keys(patch).length === 1) return { ok: true };
    const { error } = await supabaseAdmin.from("hierarchy_ae").update(patch as never).eq("ae_id", data.ae_id);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, audits);
    return { ok: true };
  });

// ---------- WD ----------
const wdUpdateSchema = z.object({
  wd_code: z.string().min(1),
  wd_name: z.string().min(1).max(255).optional(),
  ae_id: z.string().min(1).optional(),
  active: z.boolean().optional(),
  wsps: z.array(z.enum(["CEVL", "CEVJ", "CEVY"])).optional(),
});

export const updateWdMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => wdUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: cur, error: e1 } = await supabaseAdmin
      .from("hierarchy_wd").select("wd_name, ae_id, active").eq("wd_code", data.wd_code).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("WD not found");

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    const audits: Parameters<typeof logAudit>[1] = [];
    if (data.wd_name !== undefined && data.wd_name !== cur.wd_name) {
      patch.wd_name = data.wd_name;
      audits.push({ entity_type: "wd", entity_id: data.wd_code, field_changed: "wd_name",
        old_value: cur.wd_name, new_value: data.wd_name });
    }
    if (data.ae_id !== undefined && data.ae_id !== cur.ae_id) {
      const { data: aeChk } = await supabaseAdmin.from("hierarchy_ae").select("ae_id").eq("ae_id", data.ae_id).maybeSingle();
      if (!aeChk) throw new Error("Target AE not found");
      patch.ae_id = data.ae_id;
      audits.push({ entity_type: "wd", entity_id: data.wd_code, field_changed: "ae_id",
        old_value: cur.ae_id, new_value: data.ae_id });
    }
    if (data.active !== undefined && data.active !== cur.active) {
      patch.active = data.active;
      audits.push({ entity_type: "wd", entity_id: data.wd_code, field_changed: "active",
        old_value: String(cur.active), new_value: String(data.active) });
    }
    if (Object.keys(patch).length > 1) {
      const { error } = await supabaseAdmin.from("hierarchy_wd").update(patch as never).eq("wd_code", data.wd_code);
      if (error) throw new Error(error.message);
    }

    // WSP mapping sync
    if (data.wsps !== undefined) {
      const { data: existing } = await supabaseAdmin
        .from("wd_assignments").select("wsp").eq("wd_code", data.wd_code);
      const cur_wsps = new Set((existing ?? []).map((r) => r.wsp as string));
      const new_wsps = new Set(data.wsps);
      const toAdd = [...new_wsps].filter((w) => !cur_wsps.has(w));
      const toRemove = [...cur_wsps].filter((w) => !new_wsps.has(w));
      if (toAdd.length > 0) {
        await supabaseAdmin.from("wd_assignments")
          .insert(toAdd.map((w) => ({ wd_code: data.wd_code, wsp: w as "CEVL" | "CEVJ" | "CEVY" })));
      }
      if (toRemove.length > 0) {
        await supabaseAdmin.from("wd_assignments")
          .delete().eq("wd_code", data.wd_code).in("wsp", toRemove as ("CEVL"|"CEVJ"|"CEVY")[]);
      }
      if (toAdd.length || toRemove.length) {
        audits.push({ entity_type: "wd", entity_id: data.wd_code, field_changed: "wsps",
          old_value: [...cur_wsps].sort().join(","), new_value: [...new_wsps].sort().join(",") });
      }
    }

    await logAudit(context.userId, audits);
    return { ok: true };
  });

// ---------- TL ----------
const tlUpdateSchema = z.object({
  tl_id: z.string().min(1),
  tl_name: z.string().min(1).max(255).optional(),
  wd_code: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export const updateTlMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tlUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: cur, error: e1 } = await supabaseAdmin
      .from("hierarchy_tl").select("tl_name, wd_code, active").eq("tl_id", data.tl_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("TL not found");

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    const audits: Parameters<typeof logAudit>[1] = [];
    if (data.tl_name !== undefined && data.tl_name !== cur.tl_name) {
      patch.tl_name = data.tl_name;
      audits.push({ entity_type: "tl", entity_id: data.tl_id, field_changed: "tl_name",
        old_value: cur.tl_name, new_value: data.tl_name });
    }
    if (data.wd_code !== undefined && data.wd_code !== cur.wd_code) {
      const { data: wdChk } = await supabaseAdmin.from("hierarchy_wd").select("wd_code").eq("wd_code", data.wd_code).maybeSingle();
      if (!wdChk) throw new Error("Target WD not found");
      patch.wd_code = data.wd_code;
      audits.push({ entity_type: "tl", entity_id: data.tl_id, field_changed: "wd_code",
        old_value: cur.wd_code, new_value: data.wd_code });
    }
    if (data.active !== undefined && data.active !== cur.active) {
      patch.active = data.active;
      audits.push({ entity_type: "tl", entity_id: data.tl_id, field_changed: "active",
        old_value: String(cur.active), new_value: String(data.active) });
    }
    if (Object.keys(patch).length === 1) return { ok: true };
    const { error } = await supabaseAdmin.from("hierarchy_tl").update(patch as never).eq("tl_id", data.tl_id);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, audits);
    return { ok: true };
  });

// ---------- Audit ----------
const auditQuerySchema = z.object({
  entity_type: z.enum(["ae", "wd", "tl"]).optional(),
  entity_id: z.string().optional(),
  limit: z.number().min(1).max(500).default(100),
});

export const listMasterAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditQuerySchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("master_data_audit")
      .select("id, entity_type, entity_id, field_changed, old_value, new_value, changed_by, changed_at")
      .order("changed_at", { ascending: false })
      .limit(data.limit);
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.entity_id) q = q.eq("entity_id", data.entity_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const uids = [...new Set((rows ?? []).map((r) => r.changed_by))];
    let nameById = new Map<string, string>();
    if (uids.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id, display_name").in("id", uids);
      nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name ?? "Unknown"]));
    }
    return (rows ?? []).map((r) => ({ ...r, changed_by_name: nameById.get(r.changed_by) ?? "Unknown" }));
  });
