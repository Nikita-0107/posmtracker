import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Boxes, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { posmMaterials, initialStock } from "@/lib/posm-data";

export const Route = createFileRoute("/stock")({
  component: StockPage,
  head: () => ({
    meta: [
      { title: "Stock Overview — POSM Tracker" },
      { name: "description", content: "View current WSP stock levels for all POSM materials." },
    ],
  }),
});

function StockPage() {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? posmMaterials.filter(
          (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        )
      : posmMaterials;
    return list.map((m) => ({ ...m, qty: initialStock[m.code] ?? 0 }));
  }, [query]);

  const totalUnits = useMemo(
    () => Object.values(initialStock).reduce((a, b) => a + (b ?? 0), 0),
    [],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Boxes size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">Stock Overview</h2>
            <p className="text-[11px] text-muted-foreground">
              {posmMaterials.length} materials · {totalUnits} total units
            </p>
          </div>
        </div>

        {/* Search */}
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

        {/* List */}
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
    </AppShell>
  );
}
