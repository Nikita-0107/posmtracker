import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Hash,
  CheckCircle2,
  Search,
  Check,
  X,
  AlertTriangle,
  Truck,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials, useStock, dispatchMaterial, type Material } from "@/hooks/use-stock";
import { wdMaster } from "@/lib/posm-data";

export const Route = createFileRoute("/wd-issue")({
  component: WdIssuePage,
  head: () => ({
    meta: [
      { title: "Dispatch to Distributor — POSM Tracker" },
      { name: "description", content: "Dispatch POSM materials from WSP to a Distributor (WD)." },
    ],
  }),
});

function WdIssuePage() {
  const { profile } = useAuth();
  const wsp = profile?.wsp;
  const wspEnabled = !!wsp;

  const { materials } = useMaterials();
  const { stock, refresh, loading: stockLoading } = useStock();

  const [wd, setWd] = useState("");
  const [wdQuery, setWdQuery] = useState("");
  const [wdOpen, setWdOpen] = useState(false);
  const [wdHighlight, setWdHighlight] = useState(0);
  const wdBoxRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Material | null>(null);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wdResults = useMemo(() => {
    const q = wdQuery.trim().toLowerCase();
    if (!q) return wdMaster;
    return wdMaster.filter(
      (d) => d.wd_code.toLowerCase().includes(q) || d.wd_name.toLowerCase().includes(q),
    );
  }, [wdQuery]);

  useEffect(() => {
    setWdHighlight(0);
  }, [wdQuery]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wdBoxRef.current && !wdBoxRef.current.contains(e.target as Node)) {
        setWdOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectWd(code: string) {
    const found = wdMaster.find((d) => d.wd_code === code);
    setWd(code);
    setWdQuery(found ? `${found.wd_code} - ${found.wd_name}` : code);
    setWdOpen(false);
  }

  function handleWdKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setWdOpen(true);
      setWdHighlight((h) => Math.min(h + 1, wdResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setWdHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (wdOpen && wdResults[wdHighlight]) {
        e.preventDefault();
        selectWd(wdResults[wdHighlight].wd_code);
      }
    } else if (e.key === "Escape") {
      setWdOpen(false);
    }
  }


  const [result, setResult] = useState<{
    wd: string;
    code: string;
    name: string;
    qty: number;
    remaining: number;
    wsp: string;
  } | null>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? materials.filter(
        (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
    : [];

  const currentStock = selected ? stock[selected.code] ?? 0 : 0;
  const qtyNum = Number(qty);
  const exceeds = !!selected && qty !== "" && qtyNum > currentStock;
  const canSubmit = !!wd && !!selected && qty !== "" && qtyNum > 0 && !exceeds && !busy;

  function handleSelect(m: Material) {
    setSelected(m);
    setQty("");
    setError(null);
  }

  async function handleDispatch() {
    if (!canSubmit || !selected) return;
    setBusy(true);
    setError(null);
    const { newQty, error: rpcError } = await dispatchMaterial(selected.code, qtyNum, wd);
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setResult({
      wd,
      code: selected.code,
      name: selected.name,
      qty: qtyNum,
      remaining: newQty ?? 0,
      wsp: wsp ?? "",
    });
    setSelected(null);
    setQuery("");
    setQty("");
    setWd("");
    setWdQuery("");
    void refresh();
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
  const selectClass = `${inputClass} appearance-none pr-10`;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Truck size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Dispatch to Distributor</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">Issue stock from WSP to a WD</p>
          </div>
        </div>

        {!wspEnabled && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
            <p className="text-sm font-bold text-foreground">No WSP assigned</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              An admin needs to assign a WSP before you can dispatch stock.
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
              <h3 className="text-sm font-bold text-foreground">Select Distributor (WD)</h3>
            </div>
            <div ref={wdBoxRef} className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={wdQuery}
                onChange={(e) => {
                  setWdQuery(e.target.value);
                  setWd("");
                  setWdOpen(true);
                }}
                onFocus={() => setWdOpen(true)}
                onKeyDown={handleWdKeyDown}
                placeholder="Search by code or name"
                className={`${inputClass} pl-9 pr-9`}
                role="combobox"
                aria-expanded={wdOpen}
                aria-autocomplete="list"
              />
              {wdQuery && (
                <button
                  type="button"
                  onClick={() => { setWdQuery(""); setWd(""); setWdOpen(true); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Clear distributor"
                >
                  <X size={14} />
                </button>
              )}
              {wdOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-card shadow-lg">
                  {wdResults.length === 0 ? (
                    <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                      No distributors found
                    </p>
                  ) : (
                    wdResults.map((d, i) => (
                      <button
                        key={d.wd_code}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectWd(d.wd_code); }}
                        onMouseEnter={() => setWdHighlight(i)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                          i === wdHighlight ? "bg-primary/10" : "hover:bg-muted/50"
                        } ${wd === d.wd_code ? "font-bold" : ""}`}
                      >
                        <span className="font-mono text-foreground">{d.wd_code}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="truncate text-foreground">{d.wd_name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
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

            {q && !selected && results.length > 0 && (
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

            {q && !selected && results.length === 0 && (
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check size={14} />
                </span>
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
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  <h3 className="text-sm font-bold text-foreground">Quantity to Dispatch</h3>
                </div>

                <div className="flex items-center justify-between rounded-xl border-2 border-accent/30 bg-accent/5 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Current WSP Stock
                  </span>
                  <span className="font-mono text-lg font-bold text-accent">
                    {stockLoading ? "…" : currentStock}{" "}
                    <span className="text-[10px] font-semibold text-muted-foreground">units</span>
                  </span>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-foreground">Quantity to Dispatch</span>
                  <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      min={1}
                      max={currentStock}
                      inputMode="numeric"
                      placeholder="Enter quantity"
                      value={qty}
                      onChange={(e) => { setQty(e.target.value); setError(null); }}
                      className={`${inputClass} pl-9 ${exceeds ? "border-destructive ring-2 ring-destructive/20" : ""}`}
                    />
                  </div>
                </label>

                {(exceeds || error) && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                    <AlertTriangle size={14} /> {error ?? "Quantity exceeds available stock"}
                  </div>
                )}

                <button
                  onClick={handleDispatch}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                  {busy ? "Dispatching…" : "Dispatch to WD"}
                </button>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3 rounded-xl border-2 border-success/30 bg-success/5 p-4"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-success">
                <CheckCircle2 size={18} /> Dispatched Successfully
              </p>
              <div className="space-y-1.5 rounded-lg bg-card p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">WD</span>
                  <strong className="truncate text-right text-foreground">{result.wd}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Material Code</span>
                  <strong className="font-mono text-foreground">{result.code}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Description</span>
                  <span className="truncate text-right text-foreground">{result.name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Quantity Dispatched</span>
                  <strong className="text-foreground">−{result.qty}</strong>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">Remaining Stock</span>
                  <strong className="text-success">{result.remaining} units</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">WSP</span>
                  <strong className="font-mono text-primary">{result.wsp}</strong>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setResult(null)}
                  className="rounded-xl border-2 border-primary/40 bg-card py-2.5 text-sm font-bold text-primary transition active:scale-[0.98]"
                >
                  Dispatch More
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
