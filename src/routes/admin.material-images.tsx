import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/material-images")({
  component: MaterialImagesPage,
  head: () => ({ meta: [{ title: "Material Images — POSM Tracker" }] }),
});

type Row = { code: string; name: string; image_path: string };

function MaterialImagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("code, name, image_path")
        .not("image_path", "is", null)
        .order("code");
      if (!alive) return;
      if (error) {
        console.error(error);
        setRows([]);
        return;
      }
      const list = (data ?? []) as Row[];
      setRows(list);

      // sign in batches
      const paths = list.map((r) => r.image_path);
      const map: Record<string, string> = {};
      const CHUNK = 50;
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
      }
      if (alive) setSigned(map);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term),
    );
  }, [rows, q]);

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
            <ImageIcon size={18} /> Material Images
          </h1>
          <span className="text-xs text-muted-foreground">
            {rows ? `${filtered.length} / ${rows.length}` : "Loading…"}
          </span>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by code or name…"
            className="w-full rounded-lg border bg-card pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {!rows ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No material images found.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((r) => {
              const url = signed[r.image_path];
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => url && setZoom({ url, label: `${r.code} — ${r.name}` })}
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md"
                >
                  <div className="flex aspect-square items-center justify-center bg-muted">
                    {url ? (
                      <img
                        src={url}
                        alt={r.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-[11px] font-bold">{r.code}</p>
                    <p className="line-clamp-2 text-[10px] text-muted-foreground">{r.name}</p>
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
            <img src={zoom.url} alt={zoom.label} className="max-h-[80vh] w-full object-contain" />
            <div className="border-t bg-card p-3 text-xs font-semibold">{zoom.label}</div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
