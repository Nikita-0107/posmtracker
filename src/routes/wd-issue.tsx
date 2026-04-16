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
  const [success, setSuccess] = useState(false);

  const canSubmit = tl && material && qty && Number(qty) > 0;

  function handleIssue() {
    if (!canSubmit) return;
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setTl("");
      setMaterial("");
      setQty("");
    }, 2500);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Package size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold">WD Issue to TL</h2>
            <p className="text-xs text-muted-foreground">Issue material to Team Leader</p>
          </div>
        </div>

        {/* TL Select */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Select TL Name</span>
          <div className="relative">
            <select
              value={tl}
              onChange={(e) => setTl(e.target.value)}
              className="w-full appearance-none rounded-xl border bg-card px-4 py-3.5 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">— Choose Team Leader —</option>
              {teamLeaders.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Material Select */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Select POSM Material</span>
          <div className="relative">
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full appearance-none rounded-xl border bg-card px-4 py-3.5 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">— Choose material —</option>
              {posmMaterials.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Quantity */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Quantity</span>
          <div className="relative">
            <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Enter quantity"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border bg-card px-4 py-3.5 pl-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </label>

        {/* Issue Button */}
        <button
          onClick={handleIssue}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-accent py-4 text-base font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          <Package size={18} className="mr-2 inline-block" />
          Issue
        </button>

        {/* Success */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success"
            >
              <CheckCircle2 size={20} />
              ✅ Issued to TL successfully
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
