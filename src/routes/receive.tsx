import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { InvoiceFileUpload, type InvoiceFileValue } from "@/components/InvoiceFileUpload";
import { useAuth } from "@/hooks/use-auth";
import {
  useMaterials,
  useStock,
  receiveMaterial,
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
      { name: "description", content: "Receive POSM materials into your WSP stock." },
    ],
  }),
});

type Mode = { kind: "existing"; material: Material } | { kind: "new"; code: string };

function ReceivePage() {
  const { profile, user } = useAuth();
  const wsp = profile?.wsp;
  const wspEnabled = !!wsp;
  const { materials, loading: matLoading } = useMaterials();
  const { stock, loading: stockLoading, refresh } = useStock();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);

  // Receive fields
  const [newName, setNewName] = useState(""); // only for new materials
  const [qty, setQty] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [batchType, setBatchType] = useState<BatchType>("Cyclical");
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [invoiceFile, setInvoiceFile] = useState<InvoiceFileValue>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [invoiceFileError, setInvoiceFileError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<{
    code: string;
    name: string;
    qty: number;
    total: number;
    wsp: string;
    isNew: boolean;
  } | null>(null);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? materials.filter(
            (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
          )
        : [],
    [materials, q],
  );

  const hasQuery = q.length > 0;
  const noResults = hasQuery && results.length === 0;

  const isNewMode = mode?.kind === "new";
  const selectedCode = mode?.kind === "existing" ? mode.material.code : mode?.kind === "new" ? mode.code : "";
  const selectedName =
    mode?.kind === "existing" ? mode.material.name : mode?.kind === "new" ? newName.trim() : "";

  const canSubmit =
    !!mode &&
    selectedCode.trim().length > 0 &&
    (mode.kind === "existing" || newName.trim().length > 0) &&
    qty !== "" &&
    Number(qty) > 0 &&
    invoiceNumber.trim().length > 0 &&
    receivedDate !== "" &&
    receivedDate <= todayISO() &&
    !!proof &&
    !!invoiceFile &&
    !busy;

  function resetForm() {
    setMode(null);
    setNewName("");
    setQty("");
    setInvoiceNumber("");
    setReceivedDate(todayISO());
    setBatchType("Cyclical");
    setQuery("");
    if (proof?.previewUrl) URL.revokeObjectURL(proof.previewUrl);
    setProof(null);
    setInvoiceFile(null);
    setProofError(null);
    setInvoiceFileError(null);
    setError(null);
  }

  function selectExisting(m: Material) {
    setMode({ kind: "existing", material: m });
    setNewName("");
    setError(null);
  }

  function startNew() {
    setMode({ kind: "new", code: query.trim() });
    setNewName("");
    setError(null);
  }

  async function handleSubmit() {
    if (!mode) return;
    const code = (mode.kind === "new" ? mode.code : mode.material.code).trim();
    const name = mode.kind === "new" ? newName.trim() : mode.material.name;
    if (!code) {
      setError("Material code is required");
      return;
    }
    if (mode.kind === "new" && !name) {
      setError("Description is required");
      return;
    }
    const inv = invoiceNumber.trim();
    if (!inv) {
      setError("Invoice number is required");
      return;
    }
    if (!receivedDate) {
      setError("Received date is required");
      return;
    }
    if (receivedDate > todayISO()) {
      setError("Received date cannot be in the future");
      return;
    }
    if (!proof) {
      setProofError("Proof image is required");
      return;
    }
    if (!invoiceFile) {
      setInvoiceFileError("Invoice file is required");
      return;
    }
    setProofError(null);
    setInvoiceFileError(null);
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    const qNum = Number(qty);
    const { newQty, error: rpcError } = await receiveMaterial(
      code,
      name,
      qNum,
      inv,
      proof.path,
      invoiceFile.path,
      receivedDate,
      batchType,
    );
    setBusy(false);
    if (rpcError) {
      const msg = rpcError.message ?? "";
      if (
        msg.toLowerCase().includes("duplicate") ||
        (rpcError as { code?: string }).code === "23505"
      ) {
        setError("Duplicate entry detected for this invoice number");
      } else {
        setError(msg || "Failed to save");
      }
      return;
    }
    setSubmitResult({
      code,
      name,
      qty: qNum,
      total: newQty ?? 0,
      wsp: wsp ?? "",
      isNew: mode.kind === "new",
    });
    resetForm();
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
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                1
              </span>
              <h3 className="text-sm font-bold text-foreground">Select Material</h3>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMode(null);
                }}
                placeholder="Search Material Code or Name"
                className={`${inputClass} pl-9`}
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setMode(null);
                  }}
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

            {hasQuery && results.length > 0 && !mode && (
              <div className="space-y-1.5">
                {results.slice(0, 20).map((m) => (
                  <button
                    key={m.code}
                    onClick={() => selectExisting(m)}
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

            {noResults && !mode && (
              <div className="space-y-2">
                <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
                  No materials found for <span className="font-mono font-bold">{query.trim()}</span>
                </p>
                <button
                  onClick={startNew}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99]"
                >
                  <Plus size={14} /> Add New Material & Receive Stock
                </button>
              </div>
            )}

            {mode?.kind === "existing" && (
              <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-bold text-foreground">{mode.material.code}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{mode.material.name}</p>
                </div>
                <button
                  onClick={() => setMode(null)}
                  className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Change
                </button>
              </div>
            )}

            {isNewMode && (
              <div className="space-y-2.5 rounded-xl border-2 border-accent/40 bg-accent/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Sparkles size={13} className="text-accent" /> New Material
                  </p>
                  <button
                    onClick={() => setMode(null)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-foreground">
                    Material Code <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="text"
                    value={mode.code}
                    onChange={(e) => setMode({ kind: "new", code: e.target.value })}
                    placeholder="e.g. M/27008019C9"
                    className={`${inputClass} font-mono`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-foreground">
                    Description <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Material description"
                    className={inputClass}
                  />
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Material will be created and stock added in one step.
                </p>
              </div>
            )}
          </section>

          <AnimatePresence>
            {mode && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-foreground">Receive Details</h3>
                </div>

                {!isNewMode && (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Current Stock
                    </span>
                    <span className="font-mono text-base font-bold text-foreground">
                      {stockLoading ? "…" : stock[selectedCode] ?? 0}{" "}
                      <span className="text-[10px] font-semibold text-muted-foreground">units</span>
                    </span>
                  </div>
                )}

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-foreground">
                    Received Quantity <span className="text-destructive">*</span>
                  </span>
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
                  <span className="text-xs font-semibold text-foreground">
                    Invoice Number <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="text"
                    placeholder="Enter invoice / PO number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className={inputClass}
                    required
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-foreground">
                      Received Date <span className="text-destructive">*</span>
                    </span>
                    <input
                      type="date"
                      value={receivedDate}
                      max={todayISO()}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-foreground">
                      Batch Type <span className="text-destructive">*</span>
                    </span>
                    <select
                      value={batchType}
                      onChange={(e) => setBatchType(e.target.value as BatchType)}
                      className={inputClass}
                      required
                    >
                      {BATCH_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {wsp && user && (
                  <InvoiceFileUpload
                    wsp={wsp}
                    userId={user.id}
                    value={invoiceFile}
                    onChange={(v) => {
                      setInvoiceFile(v);
                      if (v) setInvoiceFileError(null);
                    }}
                    error={invoiceFileError}
                  />
                )}

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
                <CheckCircle2 size={18} />
                {submitResult.isNew ? "Material Created & Stock Added" : "Material Added to Stock"}
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
