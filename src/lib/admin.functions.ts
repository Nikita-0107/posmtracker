import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ID_DOMAIN = "posm.local";
const idToEmail = (id: string) => `${id.trim().toLowerCase()}@${ID_DOMAIN}`;
const DEFAULT_PW = "123456";

async function assertCallerRole(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, userId: string, role: "admin" | "wd_admin") {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes(role) && !roles.includes("admin")) {
    throw new Error("Forbidden");
  }
  return roles;
}

// --- Create AE (WD Admin) account ---
const aeSchema = z.object({
  ae_id: z.string().min(2).max(64),
  ae_name: z.string().min(1).max(255),
  password: z.string().min(6).max(128).optional(),
});

export const createAeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure AE exists in hierarchy
    await supabaseAdmin.from("hierarchy_ae")
      .upsert({ ae_id: data.ae_id, ae_name: data.ae_name }, { onConflict: "ae_id" });

    const email = idToEmail(data.ae_id);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password ?? DEFAULT_PW,
      email_confirm: true,
      user_metadata: { mobile: data.ae_id, display_name: data.ae_name },
    });
    if (createErr) throw new Error(createErr.message);
    const uid = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      mobile: data.ae_id,
      display_name: data.ae_name,
      ae_id: data.ae_id,
    }, { onConflict: "id" });

    await supabaseAdmin.from("user_roles").upsert({
      user_id: uid,
      role: "wd_admin" as never,
    }, { onConflict: "user_id,role" });

    return { user_id: uid };
  });

// --- Create TL account ---
const tlSchema = z.object({
  tl_id: z.string().min(1).max(64),
  tl_name: z.string().min(1).max(255),
  wd_code: z.string().min(1).max(64),
  password: z.string().min(6).max(128).optional(),
});

export const createTlAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tlSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // admin OR wd_admin who owns this WD via hierarchy
    const callerRoles = await assertCallerRole(context.supabase as never, context.userId, "wd_admin");
    if (!callerRoles.includes("admin")) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("ae_id").eq("id", context.userId).maybeSingle();
      const aeId = (prof as { ae_id: string | null } | null)?.ae_id;
      if (!aeId) throw new Error("No AE linked to your account");
      const { data: wd } = await supabaseAdmin.from("hierarchy_wd").select("ae_id").eq("wd_code", data.wd_code).maybeSingle();
      if (!wd || (wd as { ae_id: string }).ae_id !== aeId) throw new Error("WD not under your AE");
    }

    // Verify WD exists
    const { data: wdCheck } = await supabaseAdmin.from("hierarchy_wd").select("wd_code").eq("wd_code", data.wd_code).maybeSingle();
    if (!wdCheck) throw new Error("WD code not found in hierarchy");

    // Upsert TL row in hierarchy
    await supabaseAdmin.from("hierarchy_tl").upsert({
      tl_id: data.tl_id, tl_name: data.tl_name, wd_code: data.wd_code, active: true,
    }, { onConflict: "tl_id" });

    const email = idToEmail(data.tl_id);
    // Try to create; if user exists, just relink role/profile
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password ?? DEFAULT_PW,
      email_confirm: true,
      user_metadata: { mobile: data.tl_id, display_name: data.tl_name },
    });
    let uid: string;
    if (createErr) {
      if (!/already/i.test(createErr.message)) throw new Error(createErr.message);
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw new Error(createErr.message);
      uid = existing.id;
    } else {
      uid = created.user.id;
    }

    await supabaseAdmin.from("profiles").upsert({
      id: uid, mobile: data.tl_id, display_name: data.tl_name, tl_id: data.tl_id,
    }, { onConflict: "id" });

    await supabaseAdmin.from("user_roles").upsert({
      user_id: uid, role: "tl" as never,
    }, { onConflict: "user_id,role" });

    // Ensure a wd_tls row exists and is linked to this user, otherwise
    // the TL home page shows "Not linked to a TL profile".
    const { data: existingTl } = await supabaseAdmin
      .from("wd_tls")
      .select("id, user_id")
      .eq("wd_code", data.wd_code)
      .eq("tl_name", data.tl_name)
      .maybeSingle();
    if (existingTl) {
      const row = existingTl as { id: string; user_id: string | null };
      if (!row.user_id) {
        await supabaseAdmin.from("wd_tls")
          .update({ user_id: uid, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      } else if (row.user_id !== uid) {
        throw new Error("A TL with this name already exists under this WD and is linked to another account");
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from("wd_tls").insert({
        user_id: uid, wd_code: data.wd_code, tl_name: data.tl_name,
      });
      if (insErr) throw new Error(`Failed to link TL profile: ${insErr.message}`);
    }

    return { user_id: uid };
  });

// --- Bulk hierarchy import ---
const hierarchyRowSchema = z.object({
  ae_id: z.string().min(1),
  ae_name: z.string().min(1),
  wd_code: z.string().optional().nullable(),
  wd_name: z.string().optional().nullable(),
  tl_id: z.string().optional().nullable(),
  tl_name: z.string().optional().nullable(),
  section_id: z.string().optional().nullable(),
  wsp: z.enum(["CEVL", "CEVJ", "CEVY"]).optional().nullable(),
});

export const importHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(hierarchyRowSchema).min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    const { data: result, error } = await (context.supabase as never as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(
      "admin_import_hierarchy",
      { _rows: data.rows },
    );
    if (error) throw new Error(error.message);
    return result as { ae_rows: number; wd_rows: number; tl_rows: number };
  });

// --- Bulk WD stock import ---
const wdStockRowSchema = z.object({
  wd_code: z.string().min(1).max(64),
  material_code: z.string().min(1).max(128),
  material_name: z.string().min(1).max(512),
  qty: z.number().int().min(0).max(10_000_000),
});

export const importWdStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(wdStockRowSchema).min(1).max(50_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    const { data: result, error } = await (context.supabase as never as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(
      "admin_import_wd_stock",
      { _rows: data.rows },
    );
    if (error) throw new Error(error.message);
    return result as { stock_added: number; stock_updated: number; materials_created: number };
  });

// --- Seed accounts from hierarchy ---
export const seedAccountsFromHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Build email -> existing user map (paginated)
    const emailToUid = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of data.users) if (u.email) emailToUid.set(u.email.toLowerCase(), u.id);
      if (data.users.length < 1000) break;
      page++;
      if (page > 50) break;
    }

    let aeCreated = 0, tlCreated = 0, skipped = 0, errors: string[] = [];

    async function ensureAccount(id: string, name: string, kind: "ae" | "tl", wdCode?: string) {
      const email = idToEmail(id);
      let uid = emailToUid.get(email);
      if (!uid) {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email, password: DEFAULT_PW, email_confirm: true,
          user_metadata: { mobile: id, display_name: name },
        });
        if (error) {
          // race / already exists -> look up
          const { data: list } = await supabaseAdmin.auth.admin.listUsers();
          const existing = list.users.find((u: { email?: string | null }) => u.email?.toLowerCase() === email);
          if (!existing) { errors.push(`${id}: ${error.message}`); return; }
          uid = existing.id;
          skipped++;
        } else {
          uid = created.user.id;
          if (kind === "ae") aeCreated++; else tlCreated++;
        }
      } else {
        skipped++;
      }
      await supabaseAdmin.from("profiles").upsert({
        id: uid, mobile: id, display_name: name,
        ...(kind === "ae" ? { ae_id: id } : { tl_id: id, wd_code: wdCode ?? null }),
      }, { onConflict: "id" });
      await supabaseAdmin.from("user_roles").upsert({
        user_id: uid, role: (kind === "ae" ? "wd_admin" : "tl") as never,
      }, { onConflict: "user_id,role" });

      // For TLs: ensure a wd_tls row exists and is linked to this user.
      // The TL home page reads from wd_tls.user_id; without this row the TL sees
      // "Not linked to a TL profile" after seeding.
      if (kind === "tl" && wdCode) {
        // Try to find existing row by (wd_code, tl_name) unique constraint
        const { data: existingTl } = await supabaseAdmin
          .from("wd_tls")
          .select("id, user_id")
          .eq("wd_code", wdCode)
          .eq("tl_name", name)
          .maybeSingle();
        if (existingTl) {
          if (!(existingTl as { user_id: string | null }).user_id) {
            await supabaseAdmin.from("wd_tls")
              .update({ user_id: uid, updated_at: new Date().toISOString() })
              .eq("id", (existingTl as { id: string }).id);
          }
        } else {
          // Insert a fresh wd_tls row linked to this user
          const { error: insErr } = await supabaseAdmin.from("wd_tls").insert({
            user_id: uid, wd_code: wdCode, tl_name: name,
          });
          if (insErr) errors.push(`${id} (wd_tls link): ${insErr.message}`);
        }
      }
    }

    const { data: aes } = await supabaseAdmin.from("hierarchy_ae").select("ae_id, ae_name");
    for (const a of (aes ?? []) as { ae_id: string; ae_name: string }[]) {
      await ensureAccount(a.ae_id, a.ae_name, "ae");
    }
    const { data: tls } = await supabaseAdmin.from("hierarchy_tl").select("tl_id, tl_name, wd_code, active").eq("active", true);
    for (const t of (tls ?? []) as { tl_id: string; tl_name: string; wd_code: string }[]) {
      await ensureAccount(t.tl_id, t.tl_name, "tl", t.wd_code);
    }

    return { ae_created: aeCreated, tl_created: tlCreated, skipped, errors };
  });

// --- Super Admin: reset any user's password ---
const resetPwSchema = z.object({
  target_user_id: z.string().uuid(),
  new_password: z.string().min(6).max(128),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetPwSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.target_user_id,
      { password: data.new_password },
    );
    if (updErr) throw new Error(updErr.message);

    const targetLoginId =
      (updated.user?.user_metadata as { mobile?: string } | undefined)?.mobile ??
      updated.user?.email?.split("@")[0] ??
      data.target_user_id;

    const { data: callerProf } = await supabaseAdmin
      .from("profiles").select("mobile").eq("id", context.userId).maybeSingle();
    const callerLoginId = (callerProf as { mobile: string | null } | null)?.mobile ?? null;

    await supabaseAdmin.from("password_reset_audit").insert({
      target_user_id: data.target_user_id,
      target_login_id: targetLoginId,
      reset_by: context.userId,
      reset_by_login_id: callerLoginId,
    });

    return { ok: true };
  });

// --- Super Admin: delete a pending-setup user (no roles assigned yet) ---
const deletePendingSchema = z.object({
  target_user_id: z.string().uuid(),
});

export const deletePendingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deletePendingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCallerRole(context.supabase as never, context.userId, "admin");
    if (data.target_user_id === context.userId) {
      throw new Error("You cannot delete your own account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Safety: only allow deletion when the target has no roles assigned.
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.target_user_id);
    if (rolesErr) throw new Error(rolesErr.message);
    if ((roles ?? []).length > 0) {
      throw new Error("This user already has a role assigned. Remove their role before deleting.");
    }

    // Clean up profile + any wd_tls link, then delete the auth user.
    await supabaseAdmin.from("wd_tls").update({ user_id: null }).eq("user_id", data.target_user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.target_user_id);
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.target_user_id);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });
