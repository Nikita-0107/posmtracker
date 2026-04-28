import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Plus, Send, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
import {
  useTlsForMyWd,
  issueToTl,
  useWdIssuanceHistory,
} from "@/hooks/use-tl-issuances";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-issue-tl")({
  component: WdIssueTlPage,
  head: () => ({
    meta: [
      { title: "Issue to TL — POSM Tracker" },
      {
        name: "description",
        content: "Hand WD stock to a Team Leader for field placement.",
      },
    ],
  }),
});

type LineDraft = {
  key: string;
  material_code: string;
  qty: string;
};

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    material_code: "",
    qty: "",
  };
}

function WdIssueTlPage() {
  const { user } = useAuth();
  const { tls, loading: tlsLoading } = useTlsForMyWd();
  const { stock, loading: stockLoading, refresh: refreshStock } = useWdStock();
  const {
    items: history,
    loading: historyLoading,
    refresh: refreshHistory,
  } = useWdIssuanceHistory();
  const { materials } = useMaterials();
  const matName = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  const today = new Date().toISOString().slice(0, 10);
  const [tlId, setTlId] = useState("");
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);

  // Materials with stock > 0
  const stockedMaterials = useMemo(
    () =>
      stock
        .filter((r) => r.qty > 0)
        .map((r) => ({
          code: r.material_code,
          qty: r.qty,
          name: matName.get(r.material_code) ?? "",
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [stock, matName],
  );

  // Already-allocated qty per material code in the form (excluding current line)
  function allocatedExcept(idx: number, code: string): number {
    return lines.reduce((sum, l, i) => {
      if (i === idx) return sum;
      if (l.material_code !== code) return sum;
      const n = parseInt(l.qty, 10);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }

  function availableFor(idx: number, code: string): number {
    if (!code) return 0;
    const onHand = stockedMaterials.find((m) => m.code === code)?.qty ?? 0;
    return Math.max(0, onHand - allocatedExcept(idx, code));
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const canSubmit = useMemo(() => {
    if (!tlId || !date || submitting) return false;
    if (lines.length === 0) return false;
    for (const l of lines) {
      if (!l.material_code) return false;
      const n = parseInt(l.qty, 10);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    // No duplicate materials
    const codes = lines.map((l) => l.material_code);
    if (new Set(codes).size !== codes.length) return false;
    // Each line within available stock
    for (let i = 0; i < lines.length; i++) {
      const n = parseInt(lines[i].qty, 10);
      const onHand = stockedMaterials.find((m) => m.code === lines[i].material_code)?.qty ?? 0;
      if (n > onHand) return false;
    }
    return true;
  }, [tlId, date, lines, submitting, stockedMaterials]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const items = lines.map((l) => ({
      material_code: l.material_code,
      qty: parseInt(l.qty, 10),
    }));
    const { issuanceId, error } = await issueToTl(tlId, date, items);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Issued to TL · ref ${(issuanceId ?? "").slice(0, 8)}`);
    setLines([newLine()]);
    setTlId("");
    await refreshStock();
  }

  if (!user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Users size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">Issue to TL</h2>
            <p className="text-[11px] text-muted-foreground">
              Hand WD stock to a Team Leader for placement
            </p>
          </div>
        </div>

        {/* TL select */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Team Leader</span>
          <select
            value={tlId}
            onChange={(e) => setTlId(e.target.value)}
            disabled={tlsLoading}
            className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">— Select TL —</option>
            {tls.map((t) => {
              const name = (t.display_name ?? "").trim() || `+91 ${t.mobile}`;
              const suffix = t.tl_type ? ` (${t.tl_type})` : "";
              return (
                <option key={t.id} value={t.id}>
                  {name}
                  {suffix}
                </option>
              );
            })}
          </select>
          {!tlsLoading && tls.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No TLs are linked to your WD yet. Ask an admin to assign.
            </p>
          )}
        </label>

        {/* Date */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Issue date</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>

        {/* Lines */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Materials</span>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
            >
              <Plus size={12} /> Add line
            </button>
          </div>

          {stockLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading WD stock…
            </div>
          ) : stockedMaterials.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              You have no WD stock to issue.
            </p>
          ) : (
            lines.map((l, idx) => {
              const onHand =
                stockedMaterials.find((m) => m.code === l.material_code)?.qty ?? 0;
              const avail = availableFor(idx, l.material_code);
              const qtyNum = parseInt(l.qty, 10);
              const overByStock = Number.isFinite(qtyNum) && qtyNum > onHand;
              const overByAlloc =
                Number.isFinite(qtyNum) && !overByStock && qtyNum > avail;
              return (
                <div
                  key={l.key}
                  className="space-y-1.5 rounded-xl border bg-card p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={l.material_code}
                      onChange={(e) =>
                        updateLine(idx, { material_code: e.target.value })
                      }
                      className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-xs font-medium text-foreground"
                    >
                      <option value="">— Material —</option>
                      {stockedMaterials.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.code} ({m.qty}) · {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={onHand || undefined}
                      value={l.qty}
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      placeholder="Qty"
                      className="w-20 rounded-lg border bg-background px-2 py-2 text-center text-sm font-bold text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {l.material_code && (
                    <p
                      className={`text-[10px] font-semibold ${
                        overByStock || overByAlloc
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {overByStock
                        ? `Only ${onHand} in WD stock`
                        : overByAlloc
                          ? `Only ${avail} left after other lines`
                          : `Available: ${avail} of ${onHand}`}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          Issue to TL
        </button>

        <div className="pt-2 text-center">
          <Link
            to="/wd"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to WD
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
