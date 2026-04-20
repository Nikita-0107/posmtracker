import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Inbox,
  Hash,
  CheckCircle2,
  X,
  PackagePlus,
  AlertTriangle,
  Loader2,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials, useStock, receiveMaterial, type Material } from "@/hooks/use-stock";

export const Route = createFileRoute("/receive")({
  component: ReceivePage,
  head: () => ({
    meta: [
      { title: "Receive Materials — POSM Tracker" },
      { name: "description", content: "Receive POSM materials into your WSP stock." },
    ],
  }),
});

function ReceivePage() {
  const { profile } = useAuth();
  const wsp = profile?.wsp;
  const wspEnabled = !!wsp;
  const { materials, loading: matLoading, addMaterial } = useMaterials();
  const { stock, loading: stockLoading, refresh } = useStock();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Material | null>(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-new-material form state
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<{
    code: string;
    name: string;
    qty: number;
    total: number;
    wsp: string;
  } | null>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? materials.filter(
        (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
    : [];

  const hasQuery = q.length > 0;
  const noResults = hasQuery && results.length === 0;
  const canSubmit = !!selected && qty !== "" && Number(qty) > 0 && !busy;

  function handleSelect(m: Material) {
    setSelected(m);
    setError(null);
    setAddOpen(false);
  }

  async function handleAddMaterial() {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) {
      setAddError("Code and description are required");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    const { material, error: addErr } = await addMaterial(code, name);
    setAddBusy(false);
    if (addErr || !material) {
      setAddError(addErr?.message ?? "Failed to add material");
      return;
    }
    handleSelect(material);
    setQuery(material.code);
    setNewCode("");
    setNewName("");
    setAddOpen(false);
  }

  async function handleSubmit() {
    if (!canSubmit || !selected) return;
    setBusy(true);
    setError(null);
    const qNum = Number(qty);
    const { newQty, error: rpcError } = await receiveMaterial(selected.code, qNum);
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSubmitResult({
      code: selected.code,
      name: selected.name,
      qty: qNum,
      total: newQty ?? 0,
      wsp: wsp ?? "",
    });
    setSelected(null);
    setQty("");
    setQuery("");
    void refresh();
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Inbox size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Receive Materials</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">Add stock to your WSP</p>
          </div>
        </div>

        {!wspEnabled && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
            <p className="text-sm font-bold text-foreground">No WSP assigned</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              An admin needs to assign a WSP before you can receive stock.
            </p>
          </div>
        )}

        <div
          className={`space-y-5 ${!wspEnabled ? "pointer-events-none opacity-50" : ""}`}
          aria-disabled={!wspEnabled}
        >
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
              <h3 className="text-sm font-bold text-foreground">Select Material</h3>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search Material Code or Name"
                className={`${inputClass} pl-9`}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setSelected(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {matLoading && (
              <p className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Loading materials…
              </p>
            )}

            {hasQuery && results.length > 0 && !selected && (
              <div className="space-y-1.5">
                {results.slice(0, 20).map((m) => (
                  <button
                    key={m.code}
                    onClick={() => handleSelect(m)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold text-foreground">{m.code}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {noResults && !selected && (
              <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
                No materials found
              </p>
            )}

            {selected && (
              <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-bold text-foreground">{selected.code}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{selected.name}</p>
                </div>
                <button
                  onClick={() => { setSelected(null); setQty(""); }}
                  className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Change
                </button>
              </div>
            )}
          </section>

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

                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Stock
                  </span>
                  <span className="font-mono text-base font-bold text-foreground">
                    {stockLoading ? "…" : (stock[selected.code] ?? 0)}{" "}
                    <span className="text-[10px] font-semibold text-muted-foreground">units</span>
                  </span>
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

                {error && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                    <AlertTriangle size={14} /> {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                >
                  <PackagePlus size={16} />
                  {busy ? "Saving…" : "Add to WSP Stock"}
                </button>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {submitResult && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3 rounded-xl border-2 border-success/30 bg-success/5 p-4"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-success">
                <CheckCircle2 size={18} /> Material Added to Stock
              </p>
              <div className="space-y-1.5 rounded-lg bg-card p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Material Code</span>
                  <strong className="font-mono text-foreground">{submitResult.code}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Description</span>
                  <span className="truncate text-right text-foreground">{submitResult.name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Quantity Added</span>
                  <strong className="text-foreground">+{submitResult.qty}</strong>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">New Stock Total</span>
                  <strong className="text-success">{submitResult.total} units</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">WSP</span>
                  <strong className="font-mono text-primary">{submitResult.wsp}</strong>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSubmitResult(null)}
                  className="rounded-xl border-2 border-primary/40 bg-card py-2.5 text-sm font-bold text-primary transition active:scale-[0.98]"
                >
                  Add More
                </button>
                <Link
                  to="/stock"
                  className="flex items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98]"
                >
                  Done
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
