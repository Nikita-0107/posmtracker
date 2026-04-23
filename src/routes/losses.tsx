import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { XOctagon, Loader2, Package, Filter } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useMaterials } from "@/hooks/use-stock";
import { useLosses } from "@/hooks/use-losses";
import { wdMaster } from "@/lib/posm-data";

export const Route = createFileRoute("/losses")({
  component: LossesPage,
  head: () => ({
    meta: [
      { title: "Losses — POSM Tracker" },
      {
        name: "description",
        content: "Stock losses accepted from distributor-reported issues.",
      },
    ],
  }),
});

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
];

function LossesPage() {
  const [sinceDays, setSinceDays] = useState<number | null>(30);
  const [wd, setWd] = useState<string>("");
  const [material, setMaterial] = useState<string>("");

  const { rows, loading, totals } = useLosses({
    sinceDays,
    wd: wd || null,
    material: material || null,
  });
  const { materials } = useMaterials();
  const matMap = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  // Distinct WDs present in current result set (or fall back to master)
  const wdOptions = useMemo(() => {
    const codes = new Set<string>();
    rows.forEach((r) => r.distributor && codes.add(r.distributor));
    return Array.from(codes).sort();
  }, [rows]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <XOctagon size={20} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">Losses</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stock written off from accepted WD issues
            </p>
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-destructive">
              Total Lost
              {sinceDays ? ` · last ${sinceDays} days` : " · all time"}
            </p>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="font-mono text-2xl font-extrabold text-destructive">
              {totals.totalQty}
            </p>
            <p className="text-[11px] text-muted-foreground">
              units · {totals.count} {totals.count === 1 ? "event" : "events"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-muted-foreground" />
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Filters
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSinceDays(opt.days)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                  sinceDays === opt.days
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] font-bold uppercase text-muted-foreground">
                Distributor
              </span>
              <select
                value={wd}
                onChange={(e) => setWd(e.target.value)}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-[11px] font-mono text-foreground"
              >
                <option value="">All WDs</option>
                {wdOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] font-bold uppercase text-muted-foreground">
                Material
              </span>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value.trim())}
                placeholder="Material code"
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/60"
              />
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading losses…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <XOctagon className="mx-auto mb-2 text-muted-foreground" size={24} />
            <p className="text-sm font-bold text-foreground">No losses recorded</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Losses appear here once you accept an issue from a WD.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <LossCard
                key={r.id}
                row={r}
                materialName={matMap.get(r.material_code) ?? ""}
              />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            to="/"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function LossCard({
  row,
  materialName,
}: {
  row: ReturnType<typeof useLosses>["rows"][number];
  materialName: string;
}) {
  const wdName =
    wdMaster.find((w) => w.wd_code === row.distributor)?.wd_name ??
    row.distributor ??
    "—";
  const dateStr = row.resolved_at
    ? new Date(row.resolved_at).toLocaleString()
    : row.dispatch_date ?? "—";

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
          <Package size={16} className="text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
              {(row.dispatch_id ?? row.id).slice(0, 8)}
            </span>
            <span className="shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
              Closed · Loss
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">
            To <span className="text-muted-foreground">{wdName}</span>
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              ({row.distributor})
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">{dateStr}</p>
        </div>
        <div className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-right">
          <p className="font-mono text-sm font-bold text-destructive">−{row.qty}</p>
        </div>
      </div>

      <div className="space-y-1.5 p-3">
        <div>
          <p className="font-mono text-[11px] font-bold text-foreground">
            {row.material_code}
          </p>
          <p className="text-[10px] text-muted-foreground">{materialName}</p>
        </div>
        {row.issue_note?.trim() ? (
          <div className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-foreground">
            <span className="mr-1 font-bold uppercase tracking-wide text-[9px] text-muted-foreground">
              Reason:
            </span>
            {row.issue_note}
          </div>
        ) : null}
      </div>
    </div>
  );
}
