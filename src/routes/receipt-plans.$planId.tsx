import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { MaterialImagePicker, type StagedImage } from "@/components/MaterialImagePicker";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getReceiptPlan,
  submitReceiptPlanItem,
  type ReceiptPlanDetail,
  type ReceiptPlanItem,
} from "@/lib/receipt-plan.functions";

export const Route = createFileRoute("/receipt-plans/$planId")({
  component: ReceiptPlanDetailPage,
  head: () => ({ meta: [{ title: "Receipt Plan — POSM Tracker" }] }),
});

function ReceiptPlanDetailPage() {
  const { planId } = Route.useParams();
  const fetchPlan = useServerFn(getReceiptPlan);
  const submitItem = useServerFn(submitReceiptPlanItem);
  const [detail, setDetail] = useState<ReceiptPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const d = await fetchPlan({ data: { planId } });
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </AppShell>
    );
  }
  if (error || !detail) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md pt-8 text-center text-sm text-destructive">
          {error ?? "Plan not found"}
        </div>
      </AppShell>
    );
  }

  const { plan, items } = detail;
  const remaining = items.filter((i) => i.status === "pending").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4 pb-8">
        <Link
          to="/receipt-plans"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to plans
        </Link>

        <div className="rounded-xl border bg-card p-3">
          <p className="font-mono text-sm font-bold">{plan.plan_code}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {plan.wsp} · {plan.total_items} item{plan.total_items === 1 ? "" : "s"} ·{" "}
            <span className="text-success">{plan.received_items} received</span> ·{" "}
            <span className="text-destructive">{remaining} pending</span>
          </p>
        </div>

        {plan.status === "completed" ? (
          <p className="flex items-center gap-2 rounded-xl border-2 border-success/30 bg-success/5 p-3 text-sm font-bold text-success">
            <CheckCircle2 size={18} /> Plan completed
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Confirm each material below. Receipts are added to your WSP stock when you submit.
          </p>
        )}

        <ul className="space-y-3">
          {items.map((it) => (
            <ItemRow key={it.id} item={it} wsp={plan.wsp} onDone={reload} submitItem={submitItem} />
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function ItemRow({
  item,
  wsp,
  onDone,
  submitItem,
}: {
  item: ReceiptPlanItem;
  wsp: string;
  onDone: () => Promise<void>;
  submitItem: ReturnType<typeof useServerFn<typeof submitReceiptPlanItem>>;
}) {
  const { user } = useAuth();
  const [qty, setQty] = useState<string>(String(item.planned_qty));
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [matImage, setMatImage] = useState<StagedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsMaterialImage = !item.material_has_image;
  const isReceived = item.status === "received";

  async function handleSubmit() {
    setError(null);
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setError("Quantity must be a positive integer");
      return;
    }
    if (!proof) {
      setError("Proof image is required");
      return;
    }
    setBusy(true);
    try {
      let materialImagePath: string | null = null;
      if (needsMaterialImage && matImage) {
        const file = matImage.file;
        const ext = (file.type.split("/")[1] || "webp").replace("jpeg", "jpg");
        const path = `material-images/${item.material_code.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("proofs")
          .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
        if (upErr) throw new Error(`Material image upload failed: ${upErr.message}`);
        materialImagePath = path;
      } else if (needsMaterialImage && !matImage) {
        setError("Material image is required (no image on file for this material)");
        setBusy(false);
        return;
      }

      await submitItem({
        data: {
          itemId: item.id,
          receivedQty: qtyNum,
          proofImagePath: proof.path,
          materialImagePath,
        },
      });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isReceived) {
    return (
      <li className="rounded-xl border-2 border-success/30 bg-success/5 p-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-bold">{item.material_code}</p>
            <p className="text-[11px] text-muted-foreground">{item.material_description}</p>
            {item.po_number && (
              <p className="mt-0.5 text-[11px]">
                <span className="text-muted-foreground">PO:</span>{" "}
                <span className="font-mono font-semibold">{item.po_number}</span>
              </p>
            )}
            <p className="mt-1 text-[11px]">
              <span className="text-muted-foreground">Planned:</span>{" "}
              <strong>{item.planned_qty}</strong>{" "}
              <span className="ml-2 text-muted-foreground">Received:</span>{" "}
              <strong className="text-success">{item.received_qty}</strong>
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2">
        <Package size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-bold">{item.material_code}</p>
          <p className="text-[11px] text-muted-foreground">{item.material_description}</p>
          {item.po_number && (
            <p className="mt-0.5 text-[11px]">
              <span className="text-muted-foreground">PO:</span>{" "}
              <span className="font-mono font-semibold">{item.po_number}</span>
            </p>
          )}
          {item.is_new_material && (
            <p className="mt-0.5 inline-block rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              NEW MATERIAL
            </p>
          )}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold">
          Received Quantity (planned: {item.planned_qty})
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-semibold"
        />
      </label>

      {user && (
        <ProofImageUpload
          wsp={wsp}
          userId={user.id}
          kind="receive"
          value={proof}
          onChange={setProof}
          label="Receipt Proof Image"
        />
      )}

      {needsMaterialImage && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <ImageIcon size={11} /> Material Image
            <span className="text-destructive">*</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            This material has no image yet — please add one.
          </p>
          <MaterialImagePicker value={matImage} onChange={setMatImage} />
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle size={11} /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {busy ? "Submitting…" : "Confirm Receipt"}
      </button>
    </li>
  );
}
