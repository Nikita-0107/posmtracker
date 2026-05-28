import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  CheckCircle2,
  Search,
  Check,
  X,
  AlertTriangle,
  Truck,
  Loader2,
  Plus,
  Minus,
  Trash2,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { useAuth } from "@/hooks/use-auth";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { useMaterials, useStock, dispatchMaterials, type Material } from "@/hooks/use-stock";
import { supabase } from "@/integrations/supabase/client";
import { matchesSearch } from "@/lib/search";

export const Route = createFileRoute("/wd-issue")({
  component: WdIssuePage,
  head: () => ({
    meta: [
      { title: "Dispatch to Distributor — POSM Tracker" },
      { name: "description", content: "Dispatch multiple POSM materials from WSP to a Distributor (WD) in one go." },
    ],
  }),
});

type LineItem = {
  id: string;
  material: Material | null;
  query: string;
  qty: string;
  open: boolean;
};

function newLine(): LineItem {
  return {
    id: crypto.randomUUID(),
    material: null,
    query: "",
    qty: "",
    open: false,
  };
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function WdIssuePage() {
  const { profile, user } = useAuth();
  const { wsp: effectiveWsp } = useEffectiveWsp();
  const wsp = effectiveWsp ?? profile?.wsp;
  const wspEnabled = !!wsp;

  const { materials } = useMaterials();
  const { stock, refresh, loading: stockLoading } = useStock();
  // Only allow selecting materials that are actually present at this WSP
  const inStockMaterials = useMemo(
    () => materials.filter((m) => (stock[m.code] ?? 0) > 0),
    [materials, stock],
  );

  // In-transit per material = pending/issue dispatch lines from this WSP
  const [inTransit, setInTransit] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!wsp) {
      setInTransit({});
      return;
    }
    let alive = true;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("stock_movements")
        .select("material_code, qty, item_status")
        .eq("wsp", wsp)
        .eq("movement", "dispatch")
        .in("item_status", ["pending", "issue"]);
      if (!alive) return;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as { material_code: string; qty: number }[]) {
        m[r.material_code] = (m[r.material_code] ?? 0) + r.qty;
      }
      setInTransit(m);
    })();
    return () => {
      alive = false;
    };
  }, [wsp]);

  // Header
  const [date, setDate] = useState<string>(todayISO());
  const [wd, setWd] = useState("");
  const [wdQuery, setWdQuery] = useState("");
  const [wdOpen, setWdOpen] = useState(false);
  const [wdHighlight, setWdHighlight] = useState(0);
  const wdBoxRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const proofRef = useRef<HTMLDivElement | null>(null);
  const itemsSectionRef = useRef<HTMLDivElement | null>(null);

  // Line items
  const [items, setItems] = useState<LineItem[]>([newLine()]);

  // Proof + status
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    wd: string;
    wdName: string;
    date: string;
    wsp: string;
    items: { code: string; name: string; qty: number }[];
    totalQty: number;
  } | null>(null);

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

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, newLine()]);
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length === 1 ? [newLine()] : prev.filter((it) => it.id !== id)));
  }

  // Validation
  const selectedCodes = items.map((i) => i.material?.code).filter(Boolean) as string[];
  const dupCodes = new Set(
    selectedCodes.filter((c, i) => selectedCodes.indexOf(c) !== i),
  );

  const itemValidations = items.map((it) => {
    const sysQty = it.material ? stock[it.material.code] ?? 0 : 0;
    const transit = it.material ? inTransit[it.material.code] ?? 0 : 0;
    const stockQty = Math.max(0, sysQty - transit);
    const qtyNum = Number(it.qty);
    const exceeds = !!it.material && it.qty !== "" && qtyNum > stockQty;
    const dup = !!it.material && dupCodes.has(it.material.code);
    const ok =
      !!it.material &&
      it.qty !== "" &&
      qtyNum > 0 &&
      !exceeds &&
      !dup;
    return { stockQty, transit, qtyNum, exceeds, dup, ok };
  });

  const allItemsValid = itemValidations.length > 0 && itemValidations.every((v) => v.ok);
  const totalQty = itemValidations.reduce(
    (sum, v, i) => (v.ok ? sum + Number(items[i].qty) : sum),
    0,
  );
  const itemCount = items.filter((it) => !!it.material).length;
  const futureDate = date > todayISO();

  const canSubmit =
    !!wd && allItemsValid && !!proof && !busy && !!date && !futureDate;

  const wdMissing = submitted && !wd;
  const dateMissing = submitted && (!date || futureDate);
  const proofMissing = submitted && !proof;
  const itemsInvalid = submitted && !allItemsValid;

  async function handleDispatch() {
    setSubmitted(true);
    setError(null);

    type Issue = { ref: HTMLElement | null; msg: string };
    const issues: Issue[] = [];
    if (!date || futureDate) {
      issues.push({ ref: dateRef.current, msg: "Valid dispatch date is required" });
    }
    if (!wd) {
      issues.push({ ref: wdBoxRef.current, msg: "Please select a distributor" });
    }
    if (!allItemsValid) {
      issues.push({ ref: itemsSectionRef.current, msg: "Fix line item errors" });
    }
    if (!proof) {
      setProofError("Proof image is required");
      issues.push({ ref: proofRef.current, msg: "Proof image is required" });
    } else {
      setProofError(null);
    }

    if (issues.length > 0) {
      setError("Please fill all required fields");
      issues[0].ref?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!canSubmit || !proof) return;
    setBusy(true);

    const payload = items
      .filter((it) => it.material && it.qty)
      .map((it) => ({ material_code: it.material!.code, qty: Number(it.qty) }));

    const { error: rpcError } = await dispatchMaterials(wd, proof.path, payload, date);
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const wdRow = wdMaster.find((d) => d.wd_code === wd);
    setResult({
      wd,
      wdName: wdRow?.wd_name ?? "",
      date,
      wsp: wsp ?? "",
      items: items
        .filter((it) => it.material)
        .map((it) => ({
          code: it.material!.code,
          name: it.material!.name,
          qty: Number(it.qty),
        })),
      totalQty,
    });

    // Reset form
    setItems([newLine()]);
    setWd("");
    setWdQuery("");
    setDate(todayISO());
    setSubmitted(false);
    if (proof.previewUrl) URL.revokeObjectURL(proof.previewUrl);
    setProof(null);
    void refresh();
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5 pb-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Truck size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Dispatch to Distributor</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">Issue multiple items in one dispatch</p>
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
          {/* HEADER */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
              <h3 className="text-sm font-bold text-foreground">Dispatch Details</h3>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                Date <span className="text-destructive">*</span>
              </span>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={dateRef}
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputClass} pl-9 ${(futureDate || dateMissing) ? "border-destructive ring-2 ring-destructive/20" : ""}`}
                />
              </div>
              {futureDate ? (
                <span className="text-[11px] font-semibold text-destructive">Date cannot be in the future</span>
              ) : dateMissing ? (
                <span className="text-[11px] font-semibold text-destructive">Date is required</span>
              ) : null}
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                Distributor (WD) <span className="text-destructive">*</span>
              </span>
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
                  className={`${inputClass} pl-9 pr-9 ${wdMissing ? "border-destructive ring-2 ring-destructive/20" : ""}`}
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
              {wdMissing && (
                <span className="text-[11px] font-semibold text-destructive">Distributor is required</span>
              )}
            </label>
          </section>

          {/* LINE ITEMS */}
          <section ref={itemsSectionRef} className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                <h3 className="text-sm font-bold text-foreground">
                  Line Items <span className="text-destructive">*</span>
                </h3>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            {itemsInvalid && (
              <p className="text-[11px] font-semibold text-destructive">
                Each line needs a material and a valid quantity within stock
              </p>
            )}

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {items.map((it, idx) => {
                  const v = itemValidations[idx];
                  return (
                    <LineItemRow
                      key={it.id}
                      idx={idx}
                      item={it}
                      materials={inStockMaterials}
                      stockQty={v.stockQty}
                      transit={v.transit}
                      stockLoading={stockLoading}
                      exceeds={v.exceeds}
                      dup={v.dup}
                      onChange={(patch) => updateItem(it.id, patch)}
                      onRemove={() => removeItem(it.id)}
                      canRemove={items.length > 1}
                      inputClass={inputClass}
                    />
                  );
                })}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={addItem}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99]"
            >
              <Plus size={16} /> Add Item
            </button>
          </section>

          {/* PROOF + SUMMARY */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
              <h3 className="text-sm font-bold text-foreground">Proof & Submit</h3>
            </div>

            {wsp && user && (
              <div ref={proofRef}>
                <ProofImageUpload
                  wsp={wsp}
                  userId={user.id}
                  kind="dispatch"
                  value={proof}
                  onChange={(val) => {
                    setProof(val);
                    if (val) setProofError(null);
                  }}
                  error={proofError}
                  label={wd === "WD_FLUSH" ? "Upload Approval Email / Proof *" : "Proof image *"}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border-2 border-accent/30 bg-accent/5 px-3 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total Quantity
              </span>
              <span className="font-mono text-lg font-bold text-accent">
                {totalQty}{" "}
                <span className="text-[10px] font-semibold text-muted-foreground">units</span>
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <button
              onClick={handleDispatch}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
              {busy ? "Dispatching…" : `Dispatch ${itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : ""} to WD`}
            </button>
          </section>
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
                  <span className="text-muted-foreground">Date</span>
                  <strong className="text-foreground">{result.date}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">WD</span>
                  <strong className="truncate text-right text-foreground">
                    {result.wd}{result.wdName ? ` — ${result.wdName}` : ""}
                  </strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">WSP</span>
                  <strong className="font-mono text-primary">{result.wsp}</strong>
                </div>
                <div className="border-t pt-1.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Items ({result.items.length})
                  </p>
                  <div className="space-y-1">
                    {result.items.map((r) => (
                      <div key={r.code} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-foreground">{r.code}</span>
                        <span className="shrink-0 font-bold text-foreground">−{r.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">Total Dispatched</span>
                  <strong className="text-success">{result.totalQty} units</strong>
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

// ---------------- LineItemRow ----------------

type LineItemRowProps = {
  idx: number;
  item: LineItem;
  materials: Material[];
  stockQty: number;
  transit: number;
  stockLoading: boolean;
  exceeds: boolean;
  dup: boolean;
  canRemove: boolean;
  inputClass: string;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
};

function LineItemRow({
  idx,
  item,
  materials,
  stockQty,
  transit,
  stockLoading,
  exceeds,
  dup,
  canRemove,
  inputClass,
  onChange,
  onRemove,
}: LineItemRowProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onChange({ open: false });
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onChange]);

  const q = item.query.trim();
  const results = q
    ? materials.filter((m) => matchesSearch(q, m.code, m.name))
    : [];

  function pick(m: Material) {
    onChange({ material: m, query: `${m.code} - ${m.name}`, open: false });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-2 rounded-xl border-2 border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Item #{idx + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-30"
          aria-label="Remove item"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>

      {/* Material picker */}
      <div ref={boxRef} className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={item.query}
          onChange={(e) =>
            onChange({ query: e.target.value, material: null, open: true })
          }
          onFocus={() => onChange({ open: true })}
          placeholder="Search material code or name"
          className={`${inputClass} pl-9 pr-9 ${dup ? "border-destructive ring-2 ring-destructive/20" : ""}`}
        />
        {item.query && (
          <button
            type="button"
            onClick={() => onChange({ query: "", material: null, open: true })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Clear material"
          >
            <X size={14} />
          </button>
        )}
        {item.open && q && !item.material && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border bg-card shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                No materials found
              </p>
            ) : (
              results.slice(0, 20).map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition hover:bg-muted/50"
                >
                  <span className="font-mono font-bold text-foreground">{m.code}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{m.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {item.material && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-bold text-foreground">{item.material.code}</p>
            <p className="truncate text-[10px] text-muted-foreground">{item.material.name}</p>
          </div>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check size={12} />
          </span>
        </div>
      )}

      {/* Stock + Qty */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Available Stock
          </p>
          <p className="font-mono text-sm font-bold text-foreground">
            {item.material ? (stockLoading ? "…" : stockQty) : "—"}
          </p>
          {item.material && transit > 0 && (
            <p className="mt-0.5 text-[9px] text-muted-foreground">{transit} in transit</p>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity
          </p>
          {(() => {
            const disabled = !item.material;
            const current = Number(item.qty) || 0;
            const maxQty = item.material ? stockQty : Infinity;
            const dec = () => {
              if (disabled) return;
              const next = Math.max(0, current - 1);
              onChange({ qty: next === 0 ? "" : String(next) });
            };
            const inc = () => {
              if (disabled) return;
              if (current >= maxQty) return;
              onChange({ qty: String(current + 1) });
            };
            return (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={dec}
                  disabled={disabled || current <= 0}
                  aria-label="Decrease quantity"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-card text-foreground shadow-sm transition hover:border-primary hover:bg-primary/5 active:scale-95 disabled:opacity-40"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                  value={item.qty}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    onChange({ qty: v });
                  }}
                  disabled={disabled}
                  className={`h-9 w-full min-w-0 rounded-lg border bg-card px-2 text-center text-sm font-bold text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-40 ${exceeds ? "border-destructive ring-2 ring-destructive/20" : ""}`}
                />
                <button
                  type="button"
                  onClick={inc}
                  disabled={disabled || current >= maxQty}
                  aria-label="Increase quantity"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-primary/40 bg-primary/10 text-primary shadow-sm transition hover:bg-primary/20 active:scale-95 disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {(exceeds || dup) && (
        <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle size={12} />
          {dup ? "Duplicate material in this dispatch" : "Quantity exceeds available stock"}
        </div>
      )}
    </motion.div>
  );
}
