import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Sparkles,
  Trash2,
  Calendar,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { useAuth } from "@/hooks/use-auth";
import {
  useMaterials,
  useStock,
  receiveMaterials,
  type Material,
  type BatchType,
} from "@/hooks/use-stock";

const BATCH_TYPES: BatchType[] = ["Launch", "Cyclical", "SOV", "Others"];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const Route = createFileRoute("/receive")({
  component: ReceivePage,
  head: () => ({
    meta: [
      { title: "Receive Materials — POSM Tracker" },
      { name: "description", content: "Receive multiple POSM materials under one PO into your WSP stock." },
    ],
  }),
});

type LineItem = {
  id: string;
  // selected mode
  material: Material | null; // existing
  isNew: boolean; // true when adding a brand-new material code
  newCode: string;
  newName: string;
  // search ui
  query: string;
  open: boolean;
  // qty
  qty: string;
  // batch type per item
  batchType: BatchType;
};

function newLine(): LineItem {
  return {
    id: crypto.randomUUID(),
    material: null,
    isNew: false,
    newCode: "",
    newName: "",
    query: "",
    open: false,
    qty: "",
    batchType: "Cyclical",
  };
}

function ReceivePage() {
  const { profile, user } = useAuth();
  const wsp = profile?.wsp;
  const wspEnabled = !!wsp;
  const { materials, loading: matLoading } = useMaterials();
  const { stock, loading: stockLoading, refresh } = useStock();

  // HEADER
  const [poNumber, setPoNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  // LINE ITEMS
  const [items, setItems] = useState<LineItem[]>([newLine()]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<{
    poNumber: string;
    receivedDate: string;
    wsp: string;
    items: { code: string; name: string; qty: number; isNew: boolean; batchType: BatchType }[];
    totalQty: number;
  } | null>(null);

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, newLine()]);
  }
  function removeItem(id: string) {
    setItems((prev) => (prev.length === 1 ? [newLine()] : prev.filter((it) => it.id !== id)));
  }

  // Derived
  const selectedCodes = items
    .map((i) => (i.material ? i.material.code : i.isNew ? i.newCode.trim() : ""))
    .filter(Boolean);
  const dupCodes = new Set(
    selectedCodes.filter((c, i) => selectedCodes.indexOf(c) !== i),
  );

  const itemValidations = items.map((it) => {
    const code = it.material ? it.material.code : it.isNew ? it.newCode.trim() : "";
    const hasMaterial =
      !!it.material || (it.isNew && it.newCode.trim().length > 0 && it.newName.trim().length > 0);
    const qtyNum = Number(it.qty);
    const qtyOk = it.qty !== "" && qtyNum > 0;
    const dup = !!code && dupCodes.has(code);
    const ok = hasMaterial && qtyOk && !dup;
    return { code, hasMaterial, qtyNum, qtyOk, dup, ok };
  });

  const itemCount = itemValidations.filter((v) => v.hasMaterial).length;
  const totalQty = itemValidations.reduce(
    (sum, v) => (v.ok ? sum + v.qtyNum : sum),
    0,
  );
  const allItemsValid =
    itemValidations.length > 0 && itemValidations.every((v) => v.ok);
  const futureDate = receivedDate > todayISO();

  const canSubmit =
    poNumber.trim().length > 0 &&
    !!receivedDate &&
    !futureDate &&
    !!proof &&
    allItemsValid &&
    !busy;

  async function handleSubmit() {
    if (!proof) {
      setProofError("PO image is required");
      return;
    }
    setProofError(null);
    if (!canSubmit) return;

    const payload = items
      .filter((it) => itemValidations[items.indexOf(it)].ok)
      .map((it) => {
        if (it.material) {
          return {
            material_code: it.material.code,
            qty: Number(it.qty),
            batch_type: it.batchType,
          };
        }
        return {
          material_code: it.newCode.trim(),
          material_name: it.newName.trim(),
          qty: Number(it.qty),
          batch_type: it.batchType,
        };
      });

    setBusy(true);
    setError(null);
    const { error: rpcError } = await receiveMaterials(
      poNumber.trim(),
      proof.path,
      payload,
      receivedDate,
    );
    setBusy(false);
    if (rpcError) {
      const msg = rpcError.message ?? "";
      if (
        msg.toLowerCase().includes("duplicate") ||
        (rpcError as { code?: string }).code === "23505"
      ) {
        setError(
          msg.toLowerCase().includes("po")
            ? msg
            : "Duplicate entry: this PO number already exists for one of these materials",
        );
      } else {
        setError(msg || "Failed to save");
      }
      return;
    }

    setSubmitResult({
      poNumber: poNumber.trim(),
      receivedDate,
      wsp: wsp ?? "",
      items: items
        .filter((it, idx) => itemValidations[idx].ok)
        .map((it) => ({
          code: it.material ? it.material.code : it.newCode.trim(),
          name: it.material ? it.material.name : it.newName.trim(),
          qty: Number(it.qty),
          isNew: it.isNew && !it.material,
          batchType: it.batchType,
        })),
      totalQty,
    });

    // Reset form
    setItems([newLine()]);
    setPoNumber("");
    setReceivedDate(todayISO());
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
            <Inbox size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Receive Materials</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">Add multiple items to your WSP under one PO</p>
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
          {/* HEADER */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
              <h3 className="text-sm font-bold text-foreground">PO Details</h3>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                PO Number <span className="text-destructive">*</span>
              </span>
              <input
                type="text"
                placeholder="Enter PO number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className={inputClass}
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground">
                Received Date <span className="text-destructive">*</span>
              </span>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={receivedDate}
                  max={todayISO()}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className={`${inputClass} pl-9 ${futureDate ? "border-destructive ring-2 ring-destructive/20" : ""}`}
                  required
                />
              </div>
              {futureDate && (
                <span className="text-[11px] font-semibold text-destructive">Date cannot be in the future</span>
              )}
            </label>

            {wsp && user && (
              <ProofImageUpload
                wsp={wsp}
                userId={user.id}
                kind="receive"
                value={proof}
                onChange={(v) => {
                  setProof(v);
                  if (v) setProofError(null);
                }}
                error={proofError}
              />
            )}
          </section>

          {/* LINE ITEMS */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                <h3 className="text-sm font-bold text-foreground">Line Items</h3>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>

            {matLoading && (
              <p className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Loading materials…
              </p>
            )}

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {items.map((it, idx) => {
                  const v = itemValidations[idx];
                  const stockQty =
                    it.material ? stock[it.material.code] ?? 0 : 0;
                  return (
                    <ReceiveLineItemRow
                      key={it.id}
                      idx={idx}
                      item={it}
                      materials={materials}
                      stockQty={stockQty}
                      stockLoading={stockLoading}
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

          {/* SUMMARY + SUBMIT */}
          <section className="space-y-2.5">
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
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
              {busy
                ? "Saving…"
                : `Add ${itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : ""} to WSP Stock`}
            </button>
          </section>
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
                <CheckCircle2 size={18} /> Received Successfully
              </p>
              <div className="space-y-1.5 rounded-lg bg-card p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">PO Number</span>
                  <strong className="text-foreground">{submitResult.poNumber}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Date</span>
                  <strong className="text-foreground">{submitResult.receivedDate}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">WSP</span>
                  <strong className="font-mono text-primary">{submitResult.wsp}</strong>
                </div>
                <div className="border-t pt-1.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Items ({submitResult.items.length})
                  </p>
                  <div className="space-y-1">
                    {submitResult.items.map((r) => (
                      <div key={r.code} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                          {r.code}
                          {r.isNew && (
                            <span className="ml-1 rounded bg-accent/15 px-1 text-[9px] font-bold text-accent">
                              NEW
                            </span>
                          )}
                          <span className="ml-1 rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground">
                            {r.batchType}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold text-foreground">+{r.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">Total Received</span>
                  <strong className="text-success">{submitResult.totalQty} units</strong>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSubmitResult(null)}
                  className="rounded-xl border-2 border-primary/40 bg-card py-2.5 text-sm font-bold text-primary transition active:scale-[0.98]"
                >
                  Receive More
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

// ---------------- ReceiveLineItemRow ----------------

type ReceiveLineItemRowProps = {
  idx: number;
  item: LineItem;
  materials: Material[];
  stockQty: number;
  stockLoading: boolean;
  dup: boolean;
  canRemove: boolean;
  inputClass: string;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
};

function ReceiveLineItemRow({
  idx,
  item,
  materials,
  stockQty,
  stockLoading,
  dup,
  canRemove,
  inputClass,
  onChange,
  onRemove,
}: ReceiveLineItemRowProps) {
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

  const q = item.query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? materials.filter(
            (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
          )
        : [],
    [materials, q],
  );
  const noResults = q.length > 0 && results.length === 0;

  function pick(m: Material) {
    onChange({
      material: m,
      isNew: false,
      newCode: "",
      newName: "",
      query: `${m.code} - ${m.name}`,
      open: false,
    });
  }

  function startNew() {
    onChange({
      material: null,
      isNew: true,
      newCode: item.query.trim(),
      newName: "",
      open: false,
    });
  }

  function clearSelection() {
    onChange({
      material: null,
      isNew: false,
      newCode: "",
      newName: "",
      query: "",
      open: true,
    });
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
      {!item.isNew && !item.material && (
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
            className={`${inputClass} pl-9 pr-9`}
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
          {item.open && q && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border bg-card shadow-lg">
              {results.length === 0 ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startNew();
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-3 text-left text-xs font-bold text-primary transition hover:bg-primary/10"
                >
                  <Plus size={14} /> Add new material:{" "}
                  <span className="font-mono">{item.query.trim()}</span>
                </button>
              ) : (
                <>
                  {results.slice(0, 20).map((m) => (
                    <button
                      key={m.code}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(m);
                      }}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition hover:bg-muted/50"
                    >
                      <span className="font-mono font-bold text-foreground">{m.code}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{m.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startNew();
                    }}
                    className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-[11px] font-bold text-primary transition hover:bg-primary/10"
                  >
                    <Plus size={12} /> Add as new material
                  </button>
                </>
              )}
            </div>
          )}
          {noResults && !item.open && (
            <button
              type="button"
              onClick={startNew}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-2 text-[11px] font-bold text-primary transition hover:bg-primary/10"
            >
              <Plus size={12} /> Add as new material
            </button>
          )}
        </div>
      )}

      {/* Existing material chip */}
      {item.material && (
        <div className={`flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-2.5 py-2 ${dup ? "border-destructive ring-2 ring-destructive/20" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-bold text-foreground">{item.material.code}</p>
            <p className="truncate text-[10px] text-muted-foreground">{item.material.name}</p>
          </div>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check size={12} />
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 text-[10px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Change
          </button>
        </div>
      )}

      {/* New material inputs */}
      {item.isNew && (
        <div className={`space-y-2 rounded-lg border-2 border-accent/40 bg-accent/5 p-2.5 ${dup ? "ring-2 ring-destructive/30" : ""}`}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
              <Sparkles size={11} className="text-accent" /> New Material
            </p>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[10px] font-semibold text-primary underline-offset-2 hover:underline"
            >
              Change
            </button>
          </div>
          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-foreground">
              Material Code <span className="text-destructive">*</span>
            </span>
            <input
              type="text"
              value={item.newCode}
              onChange={(e) => onChange({ newCode: e.target.value })}
              placeholder="e.g. M/27008019C9"
              className={`${inputClass} py-2 font-mono text-xs`}
            />
          </label>
          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-foreground">
              Description <span className="text-destructive">*</span>
            </span>
            <input
              type="text"
              value={item.newName}
              onChange={(e) => onChange({ newName: e.target.value })}
              placeholder="Material description"
              className={`${inputClass} py-2 text-xs`}
            />
          </label>
        </div>
      )}

      {/* Stock + Qty */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Current Stock
          </p>
          <p className="font-mono text-sm font-bold text-foreground">
            {item.material ? (stockLoading ? "…" : stockQty) : item.isNew ? "0" : "—"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity <span className="text-destructive">*</span>
          </p>
          <div className="relative">
            <Hash size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="0"
              value={item.qty}
              onChange={(e) => onChange({ qty: e.target.value })}
              disabled={!item.material && !item.isNew}
              className="w-full rounded-lg border bg-card py-2 pl-7 pr-2 text-sm font-bold text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      {dup && (
        <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle size={12} />
          Duplicate material in this PO
        </div>
      )}
    </motion.div>
  );
}
