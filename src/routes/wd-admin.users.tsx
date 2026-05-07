import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Users, Loader2, UserPlus, Trash2, Power } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { createTlAccount } from "@/server/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-admin/users")({
  component: WdAdminUsersPage,
  head: () => ({ meta: [{ title: "Manage TLs — POSM Tracker" }] }),
});

type WdRow = { wd_code: string; wd_name: string };
type TlRow = { tl_id: string; tl_name: string; wd_code: string; active: boolean };

function WdAdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const { aeId, isAdmin, loading: rolesLoading } = useRoles();
  const navigate = useNavigate();
  const [wds, setWds] = useState<WdRow[]>([]);
  const [tls, setTls] = useState<TlRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [tlId, setTlId] = useState("");
  const [tlName, setTlName] = useState("");
  const [wdCode, setWdCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let wq = supabase.from("hierarchy_wd").select("wd_code, wd_name").order("wd_code");
    if (aeId && !isAdmin) wq = wq.eq("ae_id", aeId);
    const { data: wdData } = await wq;
    const wdList = (wdData ?? []) as WdRow[];
    setWds(wdList);
    if (wdList.length > 0) {
      const codes = wdList.map((w) => w.wd_code);
      const { data: tlData } = await supabase
        .from("hierarchy_tl")
        .select("tl_id, tl_name, wd_code, active")
        .in("wd_code", codes)
        .order("wd_code");
      setTls((tlData ?? []) as TlRow[]);
    } else {
      setTls([]);
    }
    setLoading(false);
  }, [aeId, isAdmin]);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    void load();
  }, [user, authLoading, rolesLoading, load, navigate]);

  async function addTl() {
    if (!tlId.trim() || !tlName.trim() || !wdCode) {
      toast.error("Fill TL ID, name, and WD");
      return;
    }
    setSubmitting(true);
    try {
      await createTlAccount({ data: { tl_id: tlId.trim(), tl_name: tlName.trim(), wd_code: wdCode } });
      toast.success(`TL ${tlId} added (default password: 123456)`);
      setTlId(""); setTlName(""); setWdCode("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(tl: TlRow) {
    const { error } = await supabase
      .from("hierarchy_tl")
      .update({ active: !tl.active })
      .eq("tl_id", tl.tl_id);
    if (error) return toast.error(error.message);
    toast.success(tl.active ? "TL deactivated" : "TL re-activated");
    await load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Users className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">Manage TLs</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Add or deactivate TLs under your WDs. Removing a TL preserves all historical transactions.
        </p>

        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><UserPlus size={14}/> Add TL</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={tlId} onChange={(e) => setTlId(e.target.value)} placeholder="TL ID (e.g. 32285)"
              className="rounded-md border bg-background px-2 py-1.5 text-sm font-bold" />
            <input value={tlName} onChange={(e) => setTlName(e.target.value)} placeholder="TL Name"
              className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            <select value={wdCode} onChange={(e) => setWdCode(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm font-bold sm:col-span-2">
              <option value="">— Select WD —</option>
              {wds.map((w) => <option key={w.wd_code} value={w.wd_code}>{w.wd_code} — {w.wd_name}</option>)}
            </select>
          </div>
          <button onClick={addTl} disabled={submitting}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
            {submitting && <Loader2 className="animate-spin" size={12}/>} Add User
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="animate-spin" size={20}/></div>
        ) : (
          <div className="space-y-2">
            {wds.map((w) => {
              const wdTls = tls.filter((t) => t.wd_code === w.wd_code);
              if (wdTls.length === 0) return null;
              return (
                <div key={w.wd_code} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="mb-2 text-sm font-bold text-foreground">{w.wd_code} — {w.wd_name}</div>
                  <div className="space-y-1.5">
                    {wdTls.map((t) => (
                      <div key={t.tl_id} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${t.active ? "" : "opacity-60"}`}>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{t.tl_name} <span className="ml-1 text-xs font-mono text-muted-foreground">#{t.tl_id}</span></div>
                          {!t.active && <div className="text-[10px] font-bold uppercase text-destructive">Inactive</div>}
                        </div>
                        <button onClick={() => toggleActive(t)}
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted">
                          {t.active ? <><Trash2 size={12}/> Remove</> : <><Power size={12}/> Reactivate</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {tls.length === 0 && <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No TLs yet.</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
