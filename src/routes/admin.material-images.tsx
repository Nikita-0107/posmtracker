import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Search, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/material-images")({
  component: ProofImagesPage,
  head: () => ({ meta: [{ title: "Proof Images — POSM Tracker" }] }),
});

type Row = {
  id: string;
  wsp: string;
  material_code: string;
  qty: number;
  movement: string;
  distributor: string | null;
  performed_by: string | null;
  created_at: string;
  reference_number: string | null;
  proof_image_path: string;
};

type Filter = "all" | "receive" | "dispatch";

function ProofImagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [wsp, setWsp] = useState<string>("all");
  const [type, setType] = useState<Filter>("all");
  const [zoom, setZoom] = useState<{ url: string; label: string; meta: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, wsp, material_code, qty, movement, distributor, performed_by, created_at, reference_number, proof_image_path",
        )
        .not("proof_image_path", "is", null)
        .is("corrected_at", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!alive) return;
      if (error) {
        console.error(error);
        setRows([]);
        return;
      }
      const list = (data ?? []) as Row[];
      setRows(list);

      // material names
      const codes = Array.from(new Set(list.map((r) => r.material_code)));
      if (codes.length) {
        const { data: mats } = await supabase
          .from("materials")
          .select("code, name")
          .in("code", codes);
        const m: Record<string, string> = {};
        for (const x of mats ?? []) m[(x as any).code] = (x as any).name;
        if (alive) setNames(m);
      }

      // user names
      const uids = Array.from(
        new Set(list.map((r) => r.performed_by).filter(Boolean) as string[]),
      );
      if (uids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id, display_name, mobile")
          .in("id", uids);
        const u: Record<string, string> = {};
        for (const x of ps ?? []) {
          const a: any = x;
          u[a.id] = a.display_name || a.mobile || a.id.slice(0, 6);
        }
        if (alive) setUsers(u);
      }

      // signed urls in batches
      const paths = list.map((r) => r.proof_image_path);
      const map: Record<string, string> = {};
      const CHUNK = 80;
      for (let i = 0; i < paths.length; i += CHUNK) {
        const batch = paths.slice(i, i + CHUNK);
        const { data: signedRes } = await supabase.storage
          .from("proofs")
          .createSignedUrls(batch, 3600);
        if (signedRes) {
          for (const s of signedRes) {
            if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
          }
        }
        if (alive) setSigned({ ...map });
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (wsp !== "all" && r.wsp !== wsp) return false;
      if (type === "receive" && r.movement !== "receive") return false;
      if (type === "dispatch" && r.movement !== "dispatch") return false;
      if (!term) return true;
      const name = names[r.material_code] || "";
      return (
        r.material_code.toLowerCase().includes(term) ||
        name.toLowerCase().includes(term) ||
        (r.distributor || "").toLowerCase().includes(term) ||
        (r.reference_number || "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, wsp, type, names]);

  if (authLoading || rolesLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <AdminTabs />

        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <ImageIcon size={18} /> Proof Images
          </h1>
          <span className="text-xs text-muted-foreground">
            {rows ? `${filtered.length} / ${rows.length}` : "Loading…"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search material, distributor, ref…"
              className="w-full rounded-lg border bg-card pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select
            value={wsp}
            onChange={(e) => setWsp(e.target.value)}
            className="rounded-lg border bg-card px-2 py-2 text-sm"
          >
            <option value="all">All WSPs</option>
            <option value="CEVL">CEVL</option>
            <option value="CEVJ">CEVJ</option>
            <option value="CEVY">CEVY</option>
          </select>
          <div className="flex rounded-lg border bg-card p-0.5 text-xs font-semibold">
            {(["all", "receive", "dispatch"] as Filter[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-md px-3 py-1.5 capitalize transition ${
                  type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {!rows ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No proof images found.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((r) => {
              const url = signed[r.proof_image_path];
              const matName = names[r.material_code] || "";
              const who = r.performed_by ? users[r.performed_by] || "" : "";
              const date = new Date(r.created_at).toLocaleDateString();
              const isReceive = r.movement === "receive";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    url &&
                    setZoom({
                      url,
                      label: `${r.material_code} — ${matName}`,
                      meta: `${r.wsp} · ${r.movement.toUpperCase()} · Qty ${r.qty}${r.distributor ? ` · ${r.distributor}` : ""}${r.reference_number ? ` · Ref ${r.reference_number}` : ""} · ${date}${who ? ` · by ${who}` : ""}`,
                    })
                  }
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md"
                >
                  <div className="relative flex aspect-square items-center justify-center bg-muted">
                    {url ? (
                      <img
                        src={url}
                        alt={r.material_code}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    )}
                    <span
                      className={`absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        isReceive
                          ? "bg-success/90 text-white"
                          : "bg-primary/90 text-primary-foreground"
                      }`}
                    >
                      {isReceive ? <ArrowDownToLine size={10} /> : <ArrowUpFromLine size={10} />}
                      {isReceive ? "IN" : "OUT"}
                    </span>
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-bold">
                      {r.wsp}
                    </span>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-[11px] font-bold">{r.material_code}</p>
                    <p className="line-clamp-1 text-[10px] text-muted-foreground">{matName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Qty {r.qty} · {date}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoom(null)}
              aria-label="Close"
              className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-1.5 text-foreground shadow hover:bg-background"
            >
              <X size={16} />
            </button>
            <img src={zoom.url} alt={zoom.label} className="max-h-[75vh] w-full object-contain" />
            <div className="border-t bg-card p-3">
              <p className="text-sm font-bold">{zoom.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{zoom.meta}</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
