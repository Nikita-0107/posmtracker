import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ImageOff,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials } from "@/hooks/use-stock";
import { toast } from "sonner";

export const Route = createFileRoute("/movements")({
  component: MovementsPage,
  head: () => ({
    meta: [
      { title: "Movements — POSM Tracker" },
      {
        name: "description",
        content: "Recent stock receive and dispatch movements with proof images.",
      },
    ],
  }),
});

type Movement = {
  id: string;
  created_at: string;
  movement: "receive" | "dispatch";
  material_code: string;
  qty: number;
  distributor: string | null;
  reference_number: string | null;
  proof_image_path: string | null;
  wsp: string;
};

const SIGNED_TTL = 60 * 60; // 1 hour

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MovementsPage() {
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "receive" | "dispatch">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, movement, material_code, qty, distributor, reference_number, proof_image_path, wsp",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (!alive) return;
      if (error) {
        toast.error("Failed to load movements", { description: error.message });
        setRows([]);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as Movement[];
      setRows(list);
      setLoading(false);

      // Batch sign all proof paths (1 hour)
      const paths = Array.from(
        new Set(list.map((r) => r.proof_image_path).filter((p): p is string => !!p)),
      );
      if (paths.length === 0) return;
      const { data: signedData } = await supabase.storage
        .from("proofs")
        .createSignedUrls(paths, SIGNED_TTL);
      if (!alive || !signedData) return;
      const map: Record<string, string> = {};
      for (const item of signedData) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      setSigned(map);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.movement !== filter) return false;
      if (!q) return true;
      const name = matMap.get(r.material_code) ?? "";
      return (
        r.material_code.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        (r.reference_number ?? "").toLowerCase().includes(q) ||
        (r.distributor ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query, matMap]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">Movements</h2>
          <p className="text-xs text-muted-foreground">
            Latest 200 entries · proof links valid for 1 hour
          </p>
        </div>

        <div className="flex gap-1.5">
          {(["all", "receive", "dispatch"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, ref, distributor"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-2.5 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
            No movements found.
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((r) => {
            const isReceive = r.movement === "receive";
            const url = r.proof_image_path ? signed[r.proof_image_path] : undefined;
            return (
              <li
                key={r.id}
                className="overflow-hidden rounded-xl border bg-card shadow-sm"
              >
                <div className="flex gap-2 p-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
                    onClick={(e) => {
                      if (!url) e.preventDefault();
                    }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt="Proof"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff size={18} className="text-muted-foreground" />
                    )}
                  </a>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          isReceive
                            ? "bg-success/15 text-success"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {isReceive ? (
                          <ArrowDownToLine size={10} />
                        ) : (
                          <ArrowUpFromLine size={10} />
                        )}
                        {r.movement}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    <div className="truncate text-xs font-bold text-foreground">
                      {r.material_code}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {matMap.get(r.material_code) ?? ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        Qty <span className="font-bold text-foreground">{r.qty}</span>
                        {isReceive && r.reference_number && (
                          <> · Ref {r.reference_number}</>
                        )}
                        {!isReceive && r.distributor && (
                          <> · {r.distributor.split(/[–-]/)[0].trim()}</>
                        )}
                      </span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/20"
                        >
                          <ExternalLink size={10} /> Proof
                        </a>
                      ) : (
                        <span className="text-[10px] italic text-muted-foreground">
                          no proof
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
