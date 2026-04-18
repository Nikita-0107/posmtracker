import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Inbox,
  Plus,
  Check,
  Hash,
  Calendar,
  CheckCircle2,
  X,
  PackagePlus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { posmMaterials, initialStock, addMaterial, type PosmMaterial } from "@/lib/posm-data";

export const Route = createFileRoute("/receive")({
  component: ReceivePage,
  head: () => ({
    meta: [
      { title: "Receive Materials — POSM Tracker" },
      { name: "description", content: "Search the catalog or add a new material, then receive into WSP stock." },
    ],
  }),
});

function ReceivePage() {
  const [stock, setStock] = useState<Record<string, number>>({ ...initialStock });
  const [, forceTick] = useState(0);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PosmMaterial | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [addedFlash, setAddedFlash] = useState(false);

  const [qty, setQty] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [submitResult, setSubmitResult] = useState<{
    code: string;
    name: string;
    qty: number;
    total: number;
  } | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return posmMaterials.filter(
      (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [query]);

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && results.length === 0;
  const canSaveMaterial = newCode.trim().length > 0 && newName.trim().length > 0;
  const canSubmit = !!selected && qty !== "" && Number(qty) > 0;

  function handleSelect(m: PosmMaterial) {
    setSelected(m);
    setShowAddForm(false);
  }

  function handleSaveMaterial() {
    if (!canSaveMaterial) return;
    const m = addMaterial(newCode, newName);
    if (!m) return;
    setStock((prev) => ({ ...prev, [m.code]: prev[m.code] ?? 0 }));
    setSelected(m);
    setShowAddForm(false);
    setNewCode("");
    setNewName("");
    setQuery("");
    setAddedFlash(true);
    forceTick((n) => n + 1);
    setTimeout(() => setAddedFlash(false), 2000);
  }

  function handleSubmit() {
    if (!canSubmit || !selected) return;
    const q = Number(qty);
    const total = (stock[selected.code] ?? 0) + q;
    setStock((prev) => ({ ...prev, [selected.code]: total }));
    setSubmitResult({ code: selected.code, name: selected.name, qty: q, total });
    setTimeout(() => {
      setSubmitResult(null);
      setSelected(null);
      setQty("");
      setQuery("");
    }, 3500);
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Inbox size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">Receive Materials</h2>
            <p className="text-[11px] text-muted-foreground">Search or add, then add to WSP stock</p>
          </div>
        </div>

        {/* STEP 1 — Search */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
            <h3 className="text-sm font-bold text-foreground">Search or Add Material</h3>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Material Code or Name"
              className={`${inputClass} pl-9`}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Results — only show when user typed */}
          {hasQuery && results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((m) => {
                const isSelected = selected?.code === m.code;
                return (
                  <button
                    key={m.code}
                    onClick={() => handleSelect(m)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-left transition active:scale-[0.99] ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "hover:border-primary/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold text-foreground">{m.code}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.name}</p>
                    </div>
                    {isSelected && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* No results -> Add new */}
          {noResults && (
            <div className="space-y-2 rounded-xl border border-dashed bg-muted/30 px-3 py-3">
              <p className="text-center text-xs text-muted-foreground">No results found</p>
              {!showAddForm && (
                <button
                  onClick={() => {
                    setNewCode(query.trim().toUpperCase());
                    setShowAddForm(true);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary/40 bg-card py-2.5 text-sm font-bold text-primary transition active:scale-[0.98]"
                >
                  <Plus size={16} /> Add New Material
                </button>
              )}
            </div>
          )}

          {/* Inline add form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2.5 rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">New Material</p>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">Code / ID</span>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      placeholder="e.g. NEW_MAT_CODE"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">Description</span>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Display Banner"
                      className={inputClass}
                    />
                  </label>
                  <button
                    onClick={handleSaveMaterial}
                    disabled={!canSaveMaterial}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                  >
                    Save Material
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {addedFlash && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1.5 text-[11px] font-semibold text-success"
              >
                <CheckCircle2 size={12} /> ✅ Material added
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* STEP 2 — Quantity (only when selected) */}
        <AnimatePresence>
          {selected && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                <h3 className="text-sm font-bold text-foreground">Enter Quantity</h3>
              </div>

              {/* Selected chip */}
              <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-bold text-foreground">{selected.code}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{selected.name}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Change
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground">Quantity</span>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="Enter quantity received"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground">Date</span>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>

              {/* STEP 3 — Submit */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  <h3 className="text-sm font-bold text-foreground">Submit</h3>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                >
                  <PackagePlus size={16} />
                  Add to WSP Stock
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Success card */}
        <AnimatePresence>
          {submitResult && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5 rounded-xl border bg-success/5 px-3 py-3 text-xs"
            >
              <p className="flex items-center gap-1.5 font-bold text-success">
                <CheckCircle2 size={16} /> ✅ Added to WSP Stock
              </p>
              <div className="space-y-0.5 text-foreground">
                <p><span className="text-muted-foreground">Material Code:</span> <strong>{submitResult.code}</strong></p>
                <p><span className="text-muted-foreground">Name:</span> {submitResult.name}</p>
                <p><span className="text-muted-foreground">Quantity Added:</span> {submitResult.qty}</p>
                <p><span className="text-muted-foreground">New Stock Total:</span> <strong>{submitResult.total}</strong></p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
