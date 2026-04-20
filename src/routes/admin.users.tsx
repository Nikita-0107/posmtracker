import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Users, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type WspCode = "CEVL" | "CEVJ" | "CEVY";
type AppRole = "admin" | "wsp";

type Row = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
  roles: AppRole[];
};

function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Check admin role
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) {
        console.error(error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data);
    })();
  }, [user, authLoading, navigate]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id, mobile, display_name, wsp").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || rErr) {
      console.error(pErr || rErr);
      toast.error("Failed to load users");
      setLoading(false);
      return;
    }
    const rolesByUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as AppRole);
      rolesByUser.set(r.user_id, list);
    });
    setRows(
      (profiles ?? []).map((p) => ({
        id: p.id,
        mobile: p.mobile,
        display_name: p.display_name,
        wsp: p.wsp as WspCode | null,
        roles: rolesByUser.get(p.id) ?? [],
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  async function updateWsp(userId: string, wsp: WspCode | null) {
    setSavingId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ wsp })
      .eq("id", userId);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("WSP updated");
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, wsp } : r)));
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    setSavingId(userId);
    if (makeAdmin) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        setSavingId(null);
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) {
        setSavingId(null);
        toast.error(error.message);
        return;
      }
    }
    setSavingId(null);
    toast.success(makeAdmin ? "Granted admin" : "Removed admin");
    setRows((prev) =>
      prev.map((r) =>
        r.id === userId
          ? {
              ...r,
              roles: makeAdmin
                ? Array.from(new Set([...r.roles, "admin" as AppRole]))
                : r.roles.filter((x) => x !== "admin"),
            }
          : r,
      ),
    );
  }

  if (authLoading || isAdmin === null) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 text-destructive" size={28} />
          <h2 className="font-heading text-lg font-bold text-foreground">Admin access required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to view this page.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">User Management</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Assign WSPs and admin roles. Users without a WSP cannot access stock data.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2" size={24} />
            No users yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const isRowAdmin = row.roles.includes("admin");
              const saving = savingId === row.id;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border bg-card p-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">
                        {row.display_name || row.mobile}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.mobile}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        WSP
                        <select
                          disabled={saving}
                          value={row.wsp ?? ""}
                          onChange={(e) =>
                            updateWsp(row.id, (e.target.value || null) as WspCode | null)
                          }
                          className="rounded-md border bg-background px-2 py-1 text-xs font-bold text-foreground"
                        >
                          <option value="">— None —</option>
                          <option value="CEVL">CEVL</option>
                          <option value="CEVJ">CEVJ</option>
                          <option value="CEVY">CEVY</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <input
                          type="checkbox"
                          disabled={saving || row.id === user?.id}
                          checked={isRowAdmin}
                          onChange={(e) => toggleAdmin(row.id, e.target.checked)}
                        />
                        Admin
                      </label>
                      {saving && <Loader2 className="animate-spin text-muted-foreground" size={14} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
