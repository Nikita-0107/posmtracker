import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Boxes, X, Loader2, Download, Truck, PackageCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { useMaterials, useStock } from "@/hooks/use-stock";
import { exportDispatchReport } from "@/lib/export-dispatch";
import { matchesSearch } from "@/lib/search";
import { supabase } from "@/integrations/supabase/client";
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
  const { wsp } = useEffectiveWsp();
  const { materials, loading: matLoading } = useMaterials();
  const { stock, loading: stockLoading } = useStock();
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [inTransit, setInTransit] = useState<Record<string, number>>({});
  const [transitLoading, setTransitLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!wsp) {
      setInTransit({});
      setTransitLoading(false);
      return;
    }
    setTransitLoading(true);
    supabase
      .from("stock_movements")
      .select("material_code, qty")
      .eq("wsp", wsp)
      .eq("movement", "dispatch")
      .eq("item_status", "pending")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error("Failed to load in-transit", error);
          setInTransit({});
        } else {
          const map: Record<string, number> = {};
          for (const row of (data ?? []) as { material_code: string; qty: number }[]) {
            map[row.material_code] = (map[row.material_code] ?? 0) + row.qty;
          }
          setInTransit(map);
        }
        setTransitLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [wsp, stock]);

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
    const list = query.trim()
      ? materials.filter((m) => matchesSearch(query, m.code, m.name))
      : materials;
    return list
      .map((m) => {
        const total = stock[m.code] ?? 0;
        const transit = inTransit[m.code] ?? 0;
        const available = Math.max(0, total - transit);
        return { ...m, total, transit, available };
      })
      .filter((m) => m.available > 0 || m.transit > 0);
  }, [query, wsp, materials, stock, inTransit]);

  const totalAvailable = useMemo(
    () => items.reduce((a, m) => a + m.available, 0),
    [items],
  );
  const totalInTransit = useMemo(
    () => items.reduce((a, m) => a + m.transit, 0),
    [items],
  );

  const loading = matLoading || stockLoading || transitLoading;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Boxes size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">WSP SOH</h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {wsp
                ? `${wsp} · ${materials.length} materials`
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
            {/* Top summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-success/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-success">
                  <PackageCheck size={12} /> Available at WSP
                </div>
                <p className="mt-1 text-2xl font-bold leading-none text-foreground">{totalAvailable}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Confirmed usable stock</p>
              </div>
              <div className="rounded-xl border bg-warning/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-warning">
                  <Truck size={12} /> In Transit to WD
                </div>
                <p className="mt-1 text-2xl font-bold leading-none text-foreground">{totalInTransit}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Pending WD verification</p>
              </div>
            </div>

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

            <div className="space-y-2">
              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No materials found</p>
              )}
              {items.map((m) => (
                <div
                  key={m.code}
                  className="rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold text-foreground">{m.code}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.name}</p>
                    </div>
                    {m.total > 0 && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        Total {m.total}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div
                      className={`rounded-lg px-2 py-1.5 ${
                        m.available > 0 ? "bg-success/10" : "bg-muted"
                      }`}
                    >
                      <p
                        className={`text-[9px] font-semibold uppercase leading-tight ${
                          m.available > 0 ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        Available at WSP
                      </p>
                      <p className="mt-0.5 text-base font-bold leading-tight text-foreground">
                        {m.available}
                      </p>
                    </div>
                    <div
                      className={`rounded-lg px-2 py-1.5 ${
                        m.transit > 0 ? "bg-warning/10" : "bg-muted"
                      }`}
                    >
                      <p
                        className={`text-[9px] font-semibold uppercase leading-tight ${
                          m.transit > 0 ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        In Transit to WD
                      </p>
                      <p className="mt-0.5 text-base font-bold leading-tight text-foreground">
                        {m.transit}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
