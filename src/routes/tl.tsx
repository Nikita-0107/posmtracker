import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Camera, ChevronRight, Loader2, PackageOpen } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useMaterials } from "@/hooks/use-stock";
import { useOpenIssuancesForTl } from "@/hooks/use-tl-issuances";

export const Route = createFileRoute("/tl")({
  component: TlHomePage,
  head: () => ({
    meta: [
      { title: "TL — POSM Tracker" },
      { name: "description", content: "Team Leader operations: upload POSM placement proof." },
    ],
  }),
});

function TlHomePage() {
  const { items, loading } = useOpenIssuancesForTl();
  const { materials } = useMaterials();
  const matName = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  // Aggregate by material across all open issuances
  const bymat = useMemo(() => {
    const map = new Map<string, { issued: number; used: number; remaining: number }>();
    for (const i of items) {
      const e = map.get(i.material_code) ?? { issued: 0, used: 0, remaining: 0 };
      e.issued += i.qty_issued;
      e.used += i.qty_used;
      e.remaining += i.remaining;
      map.set(i.material_code, e);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [items]);

  const totalRemaining = bymat.reduce((s, r) => s + r.remaining, 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Camera size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">TL Operations</h2>
            <p className="text-[11px] text-muted-foreground">
              Upload placement proof from the field
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-foreground">Choose an operation</h3>
          <Link
            to="/tl-upload"
            className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition active:scale-[0.99] hover:border-primary/40"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Camera size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">TL Upload</p>
              <p className="text-[11px] text-muted-foreground">Upload POSM placement photo</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">My Issued Stock</h3>
            {!loading && (
              <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-[11px] font-bold text-success">
                {totalRemaining} remaining
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : bymat.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center">
              <PackageOpen className="mx-auto mb-2 text-muted-foreground" size={22} />
              <p className="text-xs font-bold text-foreground">No stock issued yet</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Your WD will issue materials for you to place in the field.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {bymat.map((r) => (
                <div
                  key={r.code}
                  className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-bold text-foreground">
                      {r.code}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {matName.get(r.code) ?? ""}
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-2 text-right text-[10px]">
                    <Cell label="Issued" value={r.issued} />
                    <Cell label="Used" value={r.used} />
                    <Cell label="Left" value={r.remaining} accent="text-success" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className={`font-mono text-sm font-bold ${accent ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
