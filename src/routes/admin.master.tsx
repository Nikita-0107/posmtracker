import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Database, Loader2, Save, History, Search, X, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import {
  listMasterData, updateAeMaster, updateWdMaster, updateTlMaster, listMasterAudit,
} from "@/server/master-data.functions";
import { exportTlActivityReport } from "@/lib/export-tl-activity";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/master")({
  component: MasterDataPage,
  head: () => ({ meta: [{ title: "Master Data — POSM Tracker" }] }),
});

type Tab = "wd" | "ae" | "tl" | "audit";
const WSPS = ["CEVL", "CEVJ", "CEVY"] as const;

type AeRow = { ae_id: string; ae_name: string; active: boolean };
type WdRow = { wd_code: string; wd_name: string; ae_id: string; active: boolean; wsps: string[] };
type TlRow = { tl_id: string; tl_name: string; wd_code: string; active: boolean };
type AuditRow = {
  id: string; entity_type: string; entity_id: string; field_changed: string;
  old_value: string | null; new_value: string | null; changed_by_name: string; changed_at: string;
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

function MasterDataPage() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("wd");
  const [data, setData] = useState<{ ae: AeRow[]; wd: WdRow[]; tl: TlRow[] } | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, authLoading, rolesLoading, navigate]);

  async function refresh() {
    setLoading(true);
    try {
      const d = await listMasterData();
      setData(d as never);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }

  async function refreshAudit() {
    try {
      const r = await listMasterAudit({ data: { limit: 200 } });
      setAudit(r as never);
    } catch (e) { toast.error((e as Error).message); }
  }

  useEffect(() => { if (isSuperAdmin) refresh(); }, [isSuperAdmin]);
  useEffect(() => { if (tab === "audit") refreshAudit(); }, [tab]);

  const filterFn = useMemo(() => {
    const needle = normalize(q);
    if (!needle) return () => true;
    return (hay: string) => normalize(hay).includes(needle);
  }, [q]);

  if (rolesLoading || authLoading) {
    return <AppShell><div className="p-4 text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!isSuperAdmin) {
    return <AppShell><div className="p-4 text-sm text-muted-foreground">Super Admin only.</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminTabs />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="text-primary" size={20} />
            <h1 className="font-heading text-lg font-bold text-foreground">Master Data Management</h1>
          </div>
          <DownloadTlActivityButton />
        </div>
        <p className="text-xs text-muted-foreground">
          Maintain WD, AE and TL names, mappings and active status. Edits do not affect stock,
          dispatch history or transactions. IDs and codes remain the primary identifiers; for
          ID/code changes use bulk import.
        </p>

        <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1">
          {(["wd", "ae", "tl", "audit"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 min-w-[88px] rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}>
              {t === "wd" ? "WD Master" : t === "ae" ? "AE Master" : t === "tl" ? "TL Master" : "Audit Log"}
            </button>
          ))}
        </div>

        {tab !== "audit" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by ID, name, code…"
              className="w-full rounded-lg border bg-background pl-9 pr-9 py-2 text-sm" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {loading || !data ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={14} /> Loading…
          </div>
        ) : (
          <>
            {tab === "wd" && (
              <WdTable rows={data.wd.filter((r) =>
                filterFn(r.wd_code) || filterFn(r.wd_name) || filterFn(r.ae_id) || filterFn(r.wsps.join(",")))}
                aeOptions={data.ae} onSaved={refresh} />
            )}
            {tab === "ae" && (
              <AeTable rows={data.ae.filter((r) => filterFn(r.ae_id) || filterFn(r.ae_name))} onSaved={refresh} />
            )}
            {tab === "tl" && (
              <TlTable rows={data.tl.filter((r) => filterFn(r.tl_id) || filterFn(r.tl_name) || filterFn(r.wd_code))}
                wdOptions={data.wd} onSaved={refresh} />
            )}
            {tab === "audit" && <AuditTable rows={audit} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
    }`}>{active ? "Active" : "Inactive"}</span>
  );
}

function AeTable({ rows, onSaved }: { rows: AeRow[]; onSaved: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card text-xs">
      <table className="w-full">
        <thead className="bg-muted/50 text-left"><tr>
          <th className="p-2">AE ID</th><th className="p-2">AE Name</th>
          <th className="p-2">Status</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => <AeRowEdit key={r.ae_id} row={r} onSaved={onSaved} />)}
          {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No matches.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AeRowEdit({ row, onSaved }: { row: AeRow; onSaved: () => void }) {
  const [name, setName] = useState(row.ae_name);
  const [active, setActive] = useState(row.active);
  const [busy, setBusy] = useState(false);
  const dirty = name !== row.ae_name || active !== row.active;
  async function save() {
    setBusy(true);
    try {
      await updateAeMaster({ data: { ae_id: row.ae_id, ae_name: name, active } });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <tr className="border-t">
      <td className="p-2 font-mono font-bold">{row.ae_id}</td>
      <td className="p-2"><input value={name} onChange={(e) => setName(e.target.value)}
        className="w-full rounded border bg-background px-2 py-1" /></td>
      <td className="p-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <ActiveBadge active={active} />
        </label>
      </td>
      <td className="p-2 text-right">
        <button onClick={save} disabled={!dirty || busy}
          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={11}/> : <Save size={11}/>} Save
        </button>
      </td>
    </tr>
  );
}

function WdTable({ rows, aeOptions, onSaved }: { rows: WdRow[]; aeOptions: AeRow[]; onSaved: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card text-xs">
      <table className="w-full min-w-[700px]">
        <thead className="bg-muted/50 text-left"><tr>
          <th className="p-2">WD Code</th><th className="p-2">WD Name</th>
          <th className="p-2">Mapped WSP</th><th className="p-2">Assigned AE</th>
          <th className="p-2">Status</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => <WdRowEdit key={r.wd_code} row={r} aeOptions={aeOptions} onSaved={onSaved} />)}
          {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No matches.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function WdRowEdit({ row, aeOptions, onSaved }: { row: WdRow; aeOptions: AeRow[]; onSaved: () => void }) {
  const [name, setName] = useState(row.wd_name);
  const [aeId, setAeId] = useState(row.ae_id);
  const [active, setActive] = useState(row.active);
  const [wsps, setWsps] = useState<string[]>(row.wsps);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== row.wd_name || aeId !== row.ae_id || active !== row.active ||
    [...wsps].sort().join(",") !== [...row.wsps].sort().join(",");
  async function save() {
    setBusy(true);
    try {
      await updateWdMaster({ data: {
        wd_code: row.wd_code, wd_name: name, ae_id: aeId, active,
        wsps: wsps as ("CEVL"|"CEVJ"|"CEVY")[],
      }});
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  function toggleWsp(w: string) {
    setWsps((arr) => arr.includes(w) ? arr.filter((x) => x !== w) : [...arr, w]);
  }
  return (
    <tr className="border-t align-top">
      <td className="p-2 font-mono font-bold">{row.wd_code}</td>
      <td className="p-2"><input value={name} onChange={(e) => setName(e.target.value)}
        className="w-full min-w-[160px] rounded border bg-background px-2 py-1" /></td>
      <td className="p-2">
        <div className="flex gap-1">
          {WSPS.map((w) => (
            <button key={w} onClick={() => toggleWsp(w)}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                wsps.includes(w) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
              }`}>{w}</button>
          ))}
        </div>
      </td>
      <td className="p-2">
        <select value={aeId} onChange={(e) => setAeId(e.target.value)}
          className="rounded border bg-background px-2 py-1">
          {aeOptions.map((a) => <option key={a.ae_id} value={a.ae_id}>{a.ae_id} — {a.ae_name}</option>)}
        </select>
      </td>
      <td className="p-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <ActiveBadge active={active} />
        </label>
      </td>
      <td className="p-2 text-right">
        <button onClick={save} disabled={!dirty || busy}
          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={11}/> : <Save size={11}/>} Save
        </button>
      </td>
    </tr>
  );
}

function TlTable({ rows, wdOptions, onSaved }: { rows: TlRow[]; wdOptions: WdRow[]; onSaved: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card text-xs">
      <table className="w-full min-w-[600px]">
        <thead className="bg-muted/50 text-left"><tr>
          <th className="p-2">TL ID</th><th className="p-2">TL Name</th>
          <th className="p-2">Assigned WD</th><th className="p-2">Status</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => <TlRowEdit key={r.tl_id} row={r} wdOptions={wdOptions} onSaved={onSaved} />)}
          {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No matches.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TlRowEdit({ row, wdOptions, onSaved }: { row: TlRow; wdOptions: WdRow[]; onSaved: () => void }) {
  const [name, setName] = useState(row.tl_name);
  const [wdCode, setWdCode] = useState(row.wd_code);
  const [active, setActive] = useState(row.active);
  const [busy, setBusy] = useState(false);
  const dirty = name !== row.tl_name || wdCode !== row.wd_code || active !== row.active;
  async function save() {
    if (wdCode !== row.wd_code) {
      if (!confirm(`Reassign TL ${row.tl_id} from ${row.wd_code} to ${wdCode}? Existing transactions remain under the old WD.`)) return;
    }
    setBusy(true);
    try {
      await updateTlMaster({ data: { tl_id: row.tl_id, tl_name: name, wd_code: wdCode, active } });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <tr className="border-t">
      <td className="p-2 font-mono font-bold">{row.tl_id}</td>
      <td className="p-2"><input value={name} onChange={(e) => setName(e.target.value)}
        className="w-full min-w-[160px] rounded border bg-background px-2 py-1" /></td>
      <td className="p-2">
        <select value={wdCode} onChange={(e) => setWdCode(e.target.value)}
          className="rounded border bg-background px-2 py-1">
          {wdOptions.map((w) => <option key={w.wd_code} value={w.wd_code}>{w.wd_code} — {w.wd_name}</option>)}
        </select>
      </td>
      <td className="p-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <ActiveBadge active={active} />
        </label>
      </td>
      <td className="p-2 text-right">
        <button onClick={save} disabled={!dirty || busy}
          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={11}/> : <Save size={11}/>} Save
        </button>
      </td>
    </tr>
  );
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/30 p-2">
        <History size={14} className="text-primary" />
        <span className="font-bold">Recent changes ({rows.length})</span>
      </div>
      <table className="w-full min-w-[700px]">
        <thead className="bg-muted/50 text-left"><tr>
          <th className="p-2">When</th><th className="p-2">Entity</th><th className="p-2">ID</th>
          <th className="p-2">Field</th><th className="p-2">Old</th><th className="p-2">New</th>
          <th className="p-2">By</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
              <td className="p-2 uppercase">{r.entity_type}</td>
              <td className="p-2 font-mono">{r.entity_id}</td>
              <td className="p-2">{r.field_changed}</td>
              <td className="p-2 text-muted-foreground">{r.old_value ?? "—"}</td>
              <td className="p-2 font-bold">{r.new_value ?? "—"}</td>
              <td className="p-2">{r.changed_by_name}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No changes logged yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
