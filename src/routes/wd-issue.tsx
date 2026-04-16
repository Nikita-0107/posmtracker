import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, ChevronDown, Hash, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { teamLeaders, posmMaterials } from "@/lib/posm-data";

export const Route = createFileRoute("/wd-issue")({
  component: WdIssuePage,
  head: () => ({
    meta: [
      { title: "WD Issue to TL — POSM Tracker" },
      { name: "description", content: "Issue POSM materials from WD to Team Leader" },
    ],
  }),
});

function WdIssuePage() {
  const [tl, setTl] = useState("");
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [wdStock] = useState(100); // sample static value
  const [result, setResult] = useState<{
    code: string;
    qty: number;
    remaining: number;
  } | null>(null);

  const canSubmit = tl && material && qty && Number(qty) > 0;

  function handleIssue() {
    if (!canSubmit) return;
    const q = Number(qty);
    setResult({
      code: material,
      qty: q,
      remaining: Math.max(0, wdStock - q),
    });
    setTimeout(() => {
      setResult(null);
      setTl("");
      setMaterial("");
      setQty("");
    }, 4000);
  }

  const selectClass =
    "w-full appearance-none rounded-xl border bg-card px-3 py-3 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <Package size={18} className="text-accent" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold">Step 3: WD Issue to TL</h2>
            <p className="text-[11px] text-muted-foreground">Issue material to Team Leader</p>
          </div>
        </div>

        {/* TL Select */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Select TL Name</span>
          <div className="relative">
            <select value={tl} onChange={(e) => setTl(e.target.value)} className={selectClass}>
              <option value="">— Choose Team Leader —</option>
              {teamLeaders.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Material Select */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">POSM Material</span>
          <div className="relative">
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className={selectClass}>
              <option value="">— Select material —</option>
              {posmMaterials.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} ({m.name})
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Quantity */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Quantity</span>
          <div className="relative">
            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="number" min={1} inputMode="numeric" placeholder="Enter quantity" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputClass} pl-9`} />
          </div>
        </label>

        {/* WD Stock Info */}
        <div className="rounded-xl border bg-muted/50 px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">WD Stock Available:</span>{" "}
          <strong className="text-foreground">{wdStock}</strong>
        </div>

        {/* Issue Button */}
        <button onClick={handleIssue} disabled={!canSubmit} className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40">
          <Package size={16} className="mr-2 inline-block" />
          Issue to TL
        </button>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-1.5 rounded-xl border bg-success/5 px-3 py-3 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-success"><CheckCircle2 size={16} /> ✅ Issued Successfully</p>
              <div className="space-y-0.5 text-foreground">
                <p><span className="text-muted-foreground">Material Code:</span> <strong>{result.code}</strong></p>
                <p><span className="text-muted-foreground">Quantity:</span> {result.qty}</p>
                <p><span className="text-muted-foreground">Remaining WD Stock:</span> <strong>{result.remaining}</strong></p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
