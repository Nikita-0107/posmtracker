import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Boxes, X, Loader2, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials, useStock } from "@/hooks/use-stock";
import { exportDispatchReport } from "@/lib/export-dispatch";
import { toast } from "sonner";

export const Route = createFileRoute("/stock")({
  component: StockPage,
  head: () => ({
    meta: [
      { title: "Stock Overview — POSM Tracker" },
      { name: "description", content: "View current stock levels for your WSP." },
    ],
  }),
});

function StockPage() {
  const { profile } = useAuth();
  const wsp = profile?.wsp;
  const { materials, loading: matLoading } = useMaterials();
  const { stock, loading: stockLoading } = useStock();
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { rows, lossRows, ledgerRows, currentStockRows, filename } = await exportDispatchReport();
      toast.success(
        `Exported ${rows} dispatches · ${lossRows} losses · ${ledgerRows} ledger rows · ${currentStockRows} materials`,
        { description: filename },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast.error("Export failed", { description: msg });
    } finally {
      setExporting(false);
    }
  }

  const items = useMemo(() => {
    if (!wsp) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? materials.filter(
          (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        )
      : materials;
    return list.map((m) => ({ ...m, qty: stock[m.code] ?? 0 }));
  }, [query, wsp, materials, stock]);

  const totalUnits = useMemo(
    () => Object.values(stock).reduce((a, b) => a + b, 0),
    [stock],
  );

  const loading = matLoading || stockLoading;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Boxes size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">WSP Stock Overview</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {wsp
                ? `${wsp} · ${materials.length} materials · ${totalUnits} total units`
                : "No WSP assigned"}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            aria-label="Export dispatch data to Excel"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">Export Data</span>
          </button>
        </div>

        {!wsp ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center">
            <p className="text-sm font-bold text-foreground">No WSP assigned</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              An admin needs to assign you a WSP before stock data is available.
            </p>
          </div>
        ) : loading ? (
          <p className="flex items-center justify-center gap-1.5 py-12 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading stock…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code or name"
                className="w-full rounded-xl border bg-card py-3 pl-9 pr-9 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
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

            <div className="space-y-1.5">
              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No materials found</p>
              )}
              {items.map((m) => {
                const inStock = m.qty > 0;
                return (
                  <div
                    key={m.code}
                    className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold text-foreground">{m.code}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.name}</p>
                    </div>
                    <div
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-right ${
                        inStock ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <p className="text-sm font-bold leading-tight">{m.qty}</p>
                      <p className="text-[9px] font-semibold uppercase leading-tight">units</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
