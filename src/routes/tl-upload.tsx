import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Upload,
  PackageOpen,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import {
  useOpenIssuancesForTl,
  recordTlUpload,
} from "@/hooks/use-tl-issuances";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { toast } from "sonner";

export const Route = createFileRoute("/tl-upload")({
  component: TlUploadPage,
  head: () => ({
    meta: [
      { title: "TL Upload — POSM Tracker" },
      {
        name: "description",
        content: "Upload POSM placement photos against materials issued to you.",
      },
    ],
  }),
});

function TlUploadPage() {
  const { user, profile } = useAuth();
  const { items, loading, refresh } = useOpenIssuancesForTl();
  const { materials } = useMaterials();
  const matName = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; remaining: number } | null>(null);

  const selected = items.find((i) => i.id === itemId);
  const qtyNum = parseInt(qty, 10);
  const qtyValid =
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    !!selected &&
    qtyNum <= selected.remaining;

  const canSubmit = !!selected && qtyValid && !!proof && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !selected || !proof) return;
    setSubmitting(true);
    const { remaining, error } = await recordTlUpload(selected.id, qtyNum, proof.path);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Upload recorded");
    setResult({ code: selected.material_code, remaining: remaining ?? 0 });
    setItemId("");
    setQty("1");
    setProof(null);
    await refresh();
    setTimeout(() => setResult(null), 5000);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Camera size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold">
              Upload Implementation Proof
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Pick a material issued to you and upload the placement photo
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading your issued stock…
          </div>
        ) : items.filter((i) => i.remaining > 0).length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <PackageOpen className="mx-auto mb-2 text-muted-foreground" size={24} />
            <p className="text-sm font-bold text-foreground">No materials issued yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Your WD will issue stock to you. It'll appear here.
            </p>
            <Link
              to="/tl"
              className="mt-3 inline-block text-[11px] font-semibold text-primary underline"
            >
              ← Back to TL home
            </Link>
          </div>
        ) : (
          <>
            {/* Material from issued stock */}
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                POSM Material (issued to you)
              </span>
              <select
                value={itemId}
                onChange={(e) => {
                  setItemId(e.target.value);
                  setQty("1");
                }}
                className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                <option value="">— Select issued material —</option>
                {items
                  .filter((i) => i.remaining > 0)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.material_code} · issued {i.qty_issued} · remaining{" "}
                      {i.remaining} ({matName.get(i.material_code) ?? ""})
                    </option>
                  ))}
              </select>
            </label>

            {selected && (
              <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-2.5 text-center">
                <Stat label="Issued" value={selected.qty_issued} />
                <Stat label="Used" value={selected.qty_used} />
                <Stat
                  label="Remaining"
                  value={selected.remaining}
                  accent="text-success"
                />
              </div>
            )}

            {/* Quantity */}
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                Quantity placed
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={selected?.remaining ?? undefined}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={!selected}
                className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-bold text-foreground disabled:opacity-50"
              />
              {selected && Number.isFinite(qtyNum) && qtyNum > selected.remaining && (
                <p className="text-[11px] font-semibold text-destructive">
                  Cannot exceed remaining quantity ({selected.remaining})
                </p>
              )}
            </label>

            {/* Photo */}
            {profile && user && (
              <ProofImageUpload
                wsp={profile.wsp ?? "tl"}
                userId={user.id}
                kind="dispatch"
                value={proof}
                onChange={setProof}
                label="Placement Photo"
              />
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              Submit
            </button>
          </>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5 rounded-xl border bg-success/5 px-3 py-3 text-xs"
            >
              <p className="flex items-center gap-1.5 font-bold text-success">
                <CheckCircle2 size={16} /> Uploaded successfully
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">Material:</span>{" "}
                <strong>{result.code}</strong>
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">Remaining issued qty:</span>{" "}
                <strong>{result.remaining}</strong>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2 text-center">
          <Link
            to="/tl"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to TL home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className={`font-mono text-base font-bold ${accent ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
