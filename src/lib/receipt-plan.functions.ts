import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VALID_WSPS = ["CEVL", "CEVJ", "CEVY"] as const;
type WspCode = (typeof VALID_WSPS)[number];

export type ReceiptPlanRow = {
  material_code: string;
  material_description: string;
  qty: number;
};

export type ReceiptPlanStatus = "pending" | "in_progress" | "completed";

export type ReceiptPlanSummary = {
  id: string;
  plan_code: string;
  wsp: WspCode;
  status: ReceiptPlanStatus;
  total_items: number;
  received_items: number;
  created_at: string;
  uploaded_by_name: string | null;
};

export type ReceiptPlanItem = {
  id: string;
  material_code: string;
  material_description: string | null;
  is_new_material: boolean;
  planned_qty: number;
  received_qty: number | null;
  status: "pending" | "received";
  proof_image_path: string | null;
  material_image_path: string | null;
  received_at: string | null;
  material_has_image: boolean;
};

export type ReceiptPlanDetail = {
  plan: ReceiptPlanSummary;
  items: ReceiptPlanItem[];
};

async function assertAdmin(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin")) throw new Error("Forbidden");
}


export const getReceiptPlanReferenceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return { allowedWsps: VALID_WSPS as readonly WspCode[] };
  });

export const uploadReceiptPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wsp: WspCode; rows: ReceiptPlanRow[]; notes?: string }) => {
    if (!VALID_WSPS.includes(input.wsp)) throw new Error("Invalid WSP");
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("No rows");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const codes = Array.from(new Set(data.rows.map((r) => r.material_code)));
    const { data: existing, error: matErr } = await supabaseAdmin
      .from("materials")
      .select("code")
      .in("code", codes);
    if (matErr) throw new Error(matErr.message);
    const existingSet = new Set((existing ?? []).map((m: { code: string }) => m.code));

    const toCreate = data.rows
      .filter((r) => !existingSet.has(r.material_code))
      .map((r) => ({ code: r.material_code, name: r.material_description }));

    if (toCreate.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("materials")
        .insert(toCreate);
      if (insErr) throw new Error(`Failed to create materials: ${insErr.message}`);
    }

    const planCode = `RP-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("receipt_plans")
      .insert({
        plan_code: planCode,
        wsp: data.wsp,
        uploaded_by: context.userId,
        status: "pending",
        total_items: data.rows.length,
        received_items: 0,
        notes: data.notes ?? null,
      })
      .select("id, plan_code")
      .single();
    if (planErr) throw new Error(planErr.message);

    const itemsPayload = data.rows.map((r) => ({
      plan_id: plan.id,
      material_code: r.material_code,
      material_description: r.material_description,
      is_new_material: !existingSet.has(r.material_code),
      planned_qty: r.qty,
    }));
    const { error: itemErr } = await supabaseAdmin
      .from("receipt_plan_items")
      .insert(itemsPayload);
    if (itemErr) throw new Error(itemErr.message);

    return {
      planId: plan.id as string,
      planCode: plan.plan_code as string,
      itemsCreated: itemsPayload.length,
      materialsCreated: toCreate.length,
    };
  });

export const listMyReceiptPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceiptPlanSummary[]> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("wsp")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.wsp) return [];
    const { data, error } = await context.supabase
      .from("receipt_plans")
      .select("id, plan_code, wsp, status, total_items, received_items, created_at")
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ReceiptPlanSummary[]).map((p) => ({ ...p, uploaded_by_name: null }));
  });

export const getReceiptPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }): Promise<ReceiptPlanDetail> => {
    const { data: plan, error: pErr } = await context.supabase
      .from("receipt_plans")
      .select("id, plan_code, wsp, status, total_items, received_items, created_at")
      .eq("id", data.planId)
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: itemsRaw, error: iErr } = await context.supabase
      .from("receipt_plan_items")
      .select(
        "id, material_code, material_description, is_new_material, planned_qty, received_qty, status, proof_image_path, material_image_path, received_at",
      )
      .eq("plan_id", data.planId)
      .order("created_at", { ascending: true });
    if (iErr) throw new Error(iErr.message);

    const codes = (itemsRaw ?? []).map((i: { material_code: string }) => i.material_code);
    const { data: mats } = await context.supabase
      .from("materials")
      .select("code, image_path")
      .in("code", codes);
    const imgMap = new Map<string, string | null>();
    (mats ?? []).forEach((m: { code: string; image_path: string | null }) =>
      imgMap.set(m.code, m.image_path),
    );

    const items: ReceiptPlanItem[] = (itemsRaw ?? []).map((i: Omit<ReceiptPlanItem, "material_has_image" | "status"> & { status: string }) => ({
      ...i,
      status: i.status as "pending" | "received",
      material_has_image: !!imgMap.get(i.material_code),
    }));

    return {
      plan: { ...(plan as ReceiptPlanSummary), uploaded_by_name: null },
      items,
    };
  });

export const submitReceiptPlanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      itemId: string;
      receivedQty: number;
      proofImagePath: string;
      materialImagePath?: string | null;
    }) => {
      if (!input.itemId) throw new Error("itemId required");
      if (!input.proofImagePath) throw new Error("Proof image is required");
      if (!Number.isInteger(input.receivedQty) || input.receivedQty <= 0)
        throw new Error("Received qty must be a positive integer");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    // Load item + plan via RLS-scoped client (ensures WSP ownership)
    const { data: item, error: itemErr } = await context.supabase
      .from("receipt_plan_items")
      .select("id, material_code, material_description, planned_qty, status, plan_id")
      .eq("id", data.itemId)
      .single();
    if (itemErr) throw new Error(itemErr.message);
    if (item.status === "received") throw new Error("Item already received");

    // Use existing receive_materials RPC under user's session (writes stock + movement)
    const today = new Date().toISOString().slice(0, 10);
    const { error: rpcErr } = await context.supabase.rpc("receive_materials", {
      _reference_number: `${item.plan_id.slice(0, 8)}-${item.material_code}`,
      _proof_image_path: data.proofImagePath,
      _items: [
        {
          material_code: item.material_code,
          material_name: item.material_description ?? item.material_code,
          qty: data.receivedQty,
          batch_type: "Cyclical",
        },
      ],
      _received_date: today,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // Mark item received
    const { error: updErr } = await context.supabase
      .from("receipt_plan_items")
      .update({
        status: "received",
        received_qty: data.receivedQty,
        proof_image_path: data.proofImagePath,
        material_image_path: data.materialImagePath ?? null,
        received_by: context.userId,
        received_at: new Date().toISOString(),
      })
      .eq("id", data.itemId);
    if (updErr) throw new Error(updErr.message);

    // Link material image if provided and material has no image yet
    if (data.materialImagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: m } = await supabaseAdmin
        .from("materials")
        .select("image_path")
        .eq("code", item.material_code)
        .maybeSingle();
      if (m && !m.image_path) {
        await supabaseAdmin
          .from("materials")
          .update({
            image_path: data.materialImagePath,
            image_updated_at: new Date().toISOString(),
          })
          .eq("code", item.material_code);
      }
    }

    // Recompute plan counters + status (use admin to avoid race on RLS update)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allItems } = await supabaseAdmin
      .from("receipt_plan_items")
      .select("status")
      .eq("plan_id", item.plan_id);
    const total = (allItems ?? []).length;
    const received = (allItems ?? []).filter(
      (i: { status: string }) => i.status === "received",
    ).length;
    const status: ReceiptPlanStatus =
      received === 0 ? "pending" : received >= total ? "completed" : "in_progress";
    await supabaseAdmin
      .from("receipt_plans")
      .update({ total_items: total, received_items: received, status })
      .eq("id", item.plan_id);

    return { ok: true, planStatus: status };
  });

// Admin tracker
export type ReceiptPlanTrackerRow = {
  id: string;
  plan_code: string;
  wsp: WspCode;
  status: ReceiptPlanStatus;
  total_items: number;
  received_items: number;
  pending_items: number;
  created_at: string;
};

export const getReceiptPlanTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceiptPlanTrackerRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("receipt_plans")
      .select("id, plan_code, wsp, status, total_items, received_items, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Omit<ReceiptPlanTrackerRow, "pending_items">>).map((p) => ({
      ...p,
      pending_items: Math.max(0, (p.total_items ?? 0) - (p.received_items ?? 0)),
    }));
  });

export const deleteReceiptPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items } = await supabaseAdmin
      .from("receipt_plan_items")
      .select("status")
      .eq("plan_id", data.planId);
    if ((items ?? []).some((i: { status: string }) => i.status === "received"))
      throw new Error("Cannot delete: items already received");
    const { error } = await supabaseAdmin.from("receipt_plans").delete().eq("id", data.planId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
