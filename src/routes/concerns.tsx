import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, MessageSquareWarning, Search, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials, useStock, type Material } from "@/hooks/use-stock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/concerns")({
  component: ConcernsPage,
  head: () => ({
    meta: [
      { title: "Concerns to HO — POSM Tracker" },
      { name: "description", content: "Report stock concerns to Head Office for approval." },
    ],
  }),
});

type Reason = "shortage" | "damage" | "other";

const REASONS: { value: Reason; label: string; desc: string }[] = [
  { value: "shortage", label: "Shortage", desc: "Less than expected" },
  { value: "damage", label: "Damage", desc: "Damaged after receipt" },
  { value: "other", label: "Other", desc: "Mismatch / other issue" },
];

type ConcernRow = {
  id: string;
  material_code: string;
  system_qty: number;
  actual_qty: number;
  difference: number;
  reason: Reason;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
};

function ConcernsPage() {
  const { profile, user } = useAuth();
  const { materials } = useMaterials();
  const { stock, refresh: refreshStock } = useStock();

  const [material, setMaterial] = useState<Material | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [reason, setReason] = useState<Reason>("shortage");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<ConcernRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  // Only show materials that are actually present at this WSP (qty > 0)
  const inStockMaterials = useMemo(
    () => materials.filter((m) => (stock[m.code] ?? 0) > 0),
    [materials, stock],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inStockMaterials.slice(0, 25);
    return inStockMaterials
      .filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 25);
  }, [inStockMaterials, query]);

  const systemQty = material ? (stock[material.code] ?? 0) : 0;
  const actualNum = actualQty === "" ? null : Number(actualQty);
  const difference = material && actualNum !== null && !Number.isNaN(actualNum) ? actualNum - systemQty : null;

  async function loadHistory() {
    if (!profile?.wsp) {
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("stock_concerns")
      .select("id, material_code, system_qty, actual_qty, difference, reason, status, note, created_at")
      .eq("wsp", profile.wsp)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) console.error(error);
    setHistory((data ?? []) as ConcernRow[]);
    setLoadingHistory(false);
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.wsp]);

  function reset() {
    setMaterial(null);
    setQuery("");
    setActualQty("");
    setReason("shortage");
    setNote("");
    setProof(null);
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!material) {
      setError("Please select a material");
      return;
    }
    if (actualNum === null || Number.isNaN(actualNum) || actualNum < 0) {
      setError("Enter a valid actual quantity (0 or more)");
      return;
    }
    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc("submit_stock_concern", {
      _material_code: material.code,
      _actual_qty: actualNum,
      _reason: reason,
      _note: note || undefined,
      _proof_image_path: proof?.path ?? undefined,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    toast.success("Concern submitted to Head Office");
    reset();
    void loadHistory();
    void refreshStock();
  }

  if (!profile?.wsp) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
          No WSP assigned to your account.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <MessageSquareWarning size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Concerns to HO</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Report stock issues. Head Office will review and approve.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3 rounded-xl border bg-card p-3">
          {/* Material picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">
              Material <span className="text-destructive">*</span>
            </label>
            {material ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] font-bold">{material.code}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{material.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMaterial(null);
                    setQuery("");
                    setActualQty("");
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Clear material"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-2">
                  <Search size={14} className="text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Search material code or name"
                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                {open && filtered.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border bg-popover shadow-lg">
                    {filtered.map((m) => (
                      <button
                        key={m.code}
                        type="button"
                        onClick={() => {
                          setMaterial(m);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="block w-full border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted"
                      >
                        <p className="font-mono text-[11px] font-bold">{m.code}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{m.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quantities */}
          {material && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/30 p-2">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">System</p>
                <p className="font-mono text-base font-bold">{systemQty}</p>
              </div>
              <label className="block">
                <span className="text-[9px] font-bold uppercase text-muted-foreground">Actual *</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                  placeholder="0"
                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-base font-bold text-foreground outline-none focus:border-primary"
                />
              </label>
              <div
                className={`rounded-lg border p-2 ${
                  difference === null
                    ? "bg-muted/30"
                    : difference < 0
                      ? "border-destructive/40 bg-destructive/10"
                      : difference > 0
                        ? "border-success/40 bg-success/10"
                        : "bg-muted/30"
                }`}
              >
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Diff</p>
                <p
                  className={`font-mono text-base font-bold ${
                    difference === null
                      ? ""
                      : difference < 0
                        ? "text-destructive"
                        : difference > 0
                          ? "text-success"
                          : ""
                  }`}
                >
                  {difference === null ? "—" : (difference > 0 ? `+${difference}` : difference)}
                </p>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Reason *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`rounded-lg border-2 px-2 py-2 text-left transition ${
                    reason === r.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <p className="text-[11px] font-bold text-foreground">{r.label}</p>
                  <p className="text-[9px] text-muted-foreground">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <label className="block">
            <span className="text-xs font-bold text-foreground">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add any details for HO…"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </label>

          {/* Proof */}
          {profile?.wsp && user?.id && (
            <ProofImageUpload
              wsp={profile.wsp}
              userId={user.id}
              kind="dispatch"
              value={proof}
              onChange={setProof}
              label="Photo proof (optional)"
            />
          )}

          {error && (
            <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            Submit to Head Office
          </button>
        </div>

        {/* History */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Your recent concerns
          </h3>
          {loadingHistory ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center text-[11px] text-muted-foreground">
              No concerns submitted yet.
            </div>
          ) : (
            history.map((h) => <ConcernHistoryCard key={h.id} row={h} matName={matMap.get(h.material_code) ?? ""} />)
          )}
        </div>

        <div className="pt-2 text-center">
          <Link to="/" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function ConcernHistoryCard({ row, matName }: { row: ConcernRow; matName: string }) {
  const statusUI =
    row.status === "approved"
      ? { Icon: CheckCircle2, cls: "bg-success/15 text-success", label: "Approved" }
      : row.status === "rejected"
        ? { Icon: XCircle, cls: "bg-destructive/15 text-destructive", label: "Rejected" }
        : { Icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", label: "Pending" };
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-bold">{row.material_code}</p>
          <p className="truncate text-[10px] text-muted-foreground">{matName}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusUI.cls}`}>
          <statusUI.Icon size={10} /> {statusUI.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-[9px] font-bold uppercase text-muted-foreground">System</p>
          <p className="font-mono font-bold">{row.system_qty}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Actual</p>
          <p className="font-mono font-bold">{row.actual_qty}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Diff</p>
          <p className={`font-mono font-bold ${row.difference < 0 ? "text-destructive" : row.difference > 0 ? "text-success" : ""}`}>
            {row.difference > 0 ? `+${row.difference}` : row.difference}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="capitalize">{row.reason}</span>
        <span>{new Date(row.created_at).toLocaleString()}</span>
      </div>
      {row.note ? (
        <p className="mt-1.5 rounded-md bg-muted px-2 py-1 text-[10px] text-foreground">{row.note}</p>
      ) : null}
    </div>
  );
}
