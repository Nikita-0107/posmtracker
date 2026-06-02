import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Upload, Loader2, Network } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { importHierarchy } from "@/server/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hierarchy")({
  component: HierarchyPage,
  head: () => ({ meta: [{ title: "Hierarchy — POSM Tracker" }] }),
});

type Row = { ae_id: string; ae_name: string; wd_code?: string; wd_name?: string; tl_id?: string; tl_name?: string };

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (k: string) => headers.indexOf(k);
  const aeIdIdx = idx("ae_id");
  const aeNameIdx = idx("ae_name");
  const wdCodeIdx = idx("wd_code");
  const wdNameIdx = idx("wd_name");
  const tlIdIdx = idx("tl_id");
  const tlNameIdx = idx("tl_name");
  let lastAeId = "", lastAeName = "", lastWdCode = "", lastWdName = "";
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const ae_id = cols[aeIdIdx] || lastAeId;
    const ae_name = cols[aeNameIdx] || lastAeName;
    const wd_code = cols[wdCodeIdx] || lastWdCode;
    const wd_name = cols[wdNameIdx] || lastWdName;
    if (cols[aeIdIdx]) { lastAeId = ae_id; lastAeName = ae_name; }
    if (cols[wdCodeIdx]) { lastWdCode = wd_code; lastWdName = wd_name; }
    if (!ae_id) continue;
    rows.push({
      ae_id, ae_name,
      wd_code: wd_code || undefined,
      wd_name: wd_name || undefined,
      tl_id: tlIdIdx >= 0 ? cols[tlIdIdx] || undefined : undefined,
      tl_name: tlNameIdx >= 0 ? cols[tlNameIdx] || undefined : undefined,
    });
  }
  return rows;
}

function HierarchyPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, authLoading, rolesLoading, navigate]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setRows(parseCsv(String(reader.result || "")));
        toast.success("CSV parsed");
      } catch (err) {
        toast.error((err as Error).message);
      }
    };
    reader.readAsText(f);
  }

  async function submit() {
    if (rows.length === 0) return toast.error("No rows to import");
    setBusy(true);
    try {
      const res = await importHierarchy({ data: { rows } });
      toast.success(`Imported: ${res.ae_rows} AE rows, ${res.wd_rows} WD rows, ${res.tl_rows} TL rows`);
      setRows([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return <AppShell><div className="p-4 text-sm text-muted-foreground">Super Admin only.</div></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <AdminTabs />
        <div className="flex items-center gap-2">
          <Network className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">Master Hierarchy Import</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a CSV with columns: <code>ae_id, ae_name, wd_code, wd_name, tl_id, tl_name</code>.
          Empty AE/WD cells inherit from the row above (matches the Excel layout).
          Existing WD Admin users will be auto-linked to their AE after import.
        </p>

        <div className="rounded-xl border bg-card p-3 shadow-sm space-y-2">
          <input type="file" accept=".csv,text/csv" onChange={onFile}
            className="block w-full text-sm" />
          {rows.length > 0 && (
            <div className="text-xs text-muted-foreground">{rows.length} rows parsed.</div>
          )}
          <button onClick={submit} disabled={busy || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="animate-spin" size={12}/> : <Upload size={12}/>} Import
          </button>
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-2">AE</th><th className="p-2">WD</th><th className="p-2">TL</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><b>{r.ae_id}</b> {r.ae_name}</td>
                    <td className="p-2">{r.wd_code} {r.wd_name}</td>
                    <td className="p-2">{r.tl_id} {r.tl_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div className="p-2 text-muted-foreground">…and {rows.length - 50} more</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
