import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, ChevronDown, Hash, CheckCircle2, PackagePlus, Calendar } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { distributors, posmMaterials, initialStock } from "@/lib/posm-data";

export const Route = createFileRoute("/")({
  component: DispatchPage,
  head: () => ({
    meta: [
      { title: "WSP Stock & Dispatch — POSM Tracker" },
      { name: "description", content: "Manage WSP stock and dispatch POSM materials" },
    ],
  }),
});

function getMaterialName(code: string) {
  return posmMaterials.find((m) => m.code === code)?.name ?? "";
}

function DispatchPage() {
  const [stock, setStock] = useState<Record<string, number>>({ ...initialStock });

  // Stock entry state
  const [stockMaterial, setStockMaterial] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [stockDate, setStockDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [branchCode, setBranchCode] = useState("");
  const [stockSuccess, setStockSuccess] = useState(false);

  // Dispatch state
  const [wd, setWd] = useState("");
  const [dispMaterial, setDispMaterial] = useState("");
  const [dispQty, setDispQty] = useState("");
  const [dispResult, setDispResult] = useState<{
    code: string;
    name: string;
    qty: number;
    wd: string;
    remaining: number;
  } | null>(null);

  const canAddStock = stockMaterial && stockQty && Number(stockQty) > 0 && stockDate && branchCode;
  const canDispatch = wd && dispMaterial && dispQty && Number(dispQty) > 0;

  function handleAddStock() {
    if (!canAddStock) return;
    const q = Number(stockQty);
    setStock((prev) => ({ ...prev, [stockMaterial]: (prev[stockMaterial] ?? 0) + q }));
    setStockSuccess(true);
    setTimeout(() => {
      setStockSuccess(false);
      setStockMaterial("");
      setStockQty("");
      setBranchCode("");
    }, 2500);
  }

  function handleDispatch() {
    if (!canDispatch) return;
    const q = Number(dispQty);
    const remaining = Math.max(0, (stock[dispMaterial] ?? 0) - q);
    setStock((prev) => ({ ...prev, [dispMaterial]: remaining }));
    setDispResult({
      code: dispMaterial,
      name: getMaterialName(dispMaterial),
      qty: q,
      wd,
      remaining,
    });
    setTimeout(() => {
      setDispResult(null);
      setWd("");
      setDispMaterial("");
      setDispQty("");
    }, 4000);
  }

  const selectClass =
    "w-full appearance-none rounded-xl border bg-card px-3 py-3 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-6">
        {/* ---- STEP 1: STOCK ENTRY ---- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <PackagePlus size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold">Step 1: WSP Stock Entry</h2>
              <p className="text-[11px] text-muted-foreground">Inward from HO</p>
            </div>
          </div>

          {/* Material */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">POSM Material</span>
            <div className="relative">
              <select value={stockMaterial} onChange={(e) => setStockMaterial(e.target.value)} className={selectClass}>
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

          {/* Qty */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Quantity Received</span>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="number" min={1} inputMode="numeric" placeholder="Enter quantity" value={stockQty} onChange={(e) => setStockQty(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
          </label>

          {/* Date */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Date</span>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="date" value={stockDate} onChange={(e) => setStockDate(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
          </label>

          {/* Branch Code */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Branch Code</span>
            <input type="text" placeholder="e.g. VZG-01" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className={inputClass} />
          </label>

          <button onClick={handleAddStock} disabled={!canAddStock} className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40">
            <PackagePlus size={16} className="mr-2 inline-block" />
            Add Stock
          </button>

          <AnimatePresence>
            {stockSuccess && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-xs font-semibold text-success">
                <CheckCircle2 size={16} /> ✅ Stock added successfully
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ---- CURRENT STOCK ---- */}
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-bold text-foreground">Current WSP Stock</h3>
          <div className="rounded-xl border bg-card divide-y">
            {posmMaterials.map((m) => (
              <div key={m.code} className="flex items-center justify-between px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">{m.code}</p>
                  <p className="text-[11px] text-muted-foreground">{m.name}</p>
                </div>
                <span className="ml-2 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary tabular-nums">
                  {stock[m.code] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- STEP 2: DISPATCH ---- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Truck size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold">Step 2: Dispatch to Distributor</h2>
              <p className="text-[11px] text-muted-foreground">Send POSM to WD</p>
            </div>
          </div>

          {/* WD */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Select WD (Distributor)</span>
            <div className="relative">
              <select value={wd} onChange={(e) => setWd(e.target.value)} className={selectClass}>
                <option value="">— Choose distributor —</option>
                {distributors.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </label>

          {/* Material */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">POSM Material</span>
            <div className="relative">
              <select value={dispMaterial} onChange={(e) => setDispMaterial(e.target.value)} className={selectClass}>
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

          {/* Qty */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Quantity</span>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="number" min={1} inputMode="numeric" placeholder="Enter quantity" value={dispQty} onChange={(e) => setDispQty(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
          </label>

          <button onClick={handleDispatch} disabled={!canDispatch} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40">
            <Truck size={16} className="mr-2 inline-block" />
            Dispatch to WD
          </button>

          <AnimatePresence>
            {dispResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-1.5 rounded-xl border bg-success/5 px-3 py-3 text-xs">
                <p className="flex items-center gap-1.5 font-bold text-success"><CheckCircle2 size={16} /> ✅ Dispatched Successfully</p>
                <div className="space-y-0.5 text-foreground">
                  <p><span className="text-muted-foreground">Material Code:</span> <strong>{dispResult.code}</strong></p>
                  <p><span className="text-muted-foreground">Material Name:</span> {dispResult.name}</p>
                  <p><span className="text-muted-foreground">Quantity:</span> {dispResult.qty}</p>
                  <p><span className="text-muted-foreground">WD:</span> {dispResult.wd}</p>
                  <p><span className="text-muted-foreground">Remaining Stock:</span> <strong>{dispResult.remaining}</strong></p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </AppShell>
  );
}
