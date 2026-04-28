import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Users, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { wdMaster } from "@/lib/posm-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type WspCode = "CEVL" | "CEVJ" | "CEVY";
type AppRole = "admin" | "wsp" | "wd" | "tl";
type PrimaryRole = "wsp" | "wd" | "tl";

const WSP_OPTIONS: WspCode[] = ["CEVL", "CEVJ", "CEVY"];

type Row = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
  wd_code: string | null;
  tl_type: string | null;
  roles: AppRole[];
  // For WD users: which WSPs they're allowed to receive from
  allowed_wsps: WspCode[];
};

const TL_TYPE_OPTIONS = ["Merch TL", "Sales TL", "Other"];

function primaryRoleOf(roles: AppRole[]): PrimaryRole | null {
  if (roles.includes("wsp")) return "wsp";
  if (roles.includes("wd")) return "wd";
  if (roles.includes("tl")) return "tl";
  return null;
}

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
    const [
      { data: profiles, error: pErr },
      { data: roles, error: rErr },
      { data: assignments, error: aErr },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, mobile, display_name, wsp, wd_code, tl_type")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("wd_assignments").select("wd_code, wsp"),
    ]);
    if (pErr || rErr || aErr) {
      console.error(pErr || rErr || aErr);
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
    const wspsByWd = new Map<string, WspCode[]>();
    (assignments ?? []).forEach((a) => {
      const list = wspsByWd.get(a.wd_code) ?? [];
      list.push(a.wsp as WspCode);
      wspsByWd.set(a.wd_code, list);
    });
    const mapped: Row[] = (profiles ?? []).map((p) => ({
      id: p.id,
      mobile: p.mobile,
      display_name: p.display_name,
      wsp: p.wsp as WspCode | null,
      wd_code: p.wd_code,
      roles: rolesByUser.get(p.id) ?? [],
      allowed_wsps: p.wd_code ? wspsByWd.get(p.wd_code) ?? [] : [],
    }));
    // Sort users with no role to the top so admins see pending signups first.
    mapped.sort((a, b) => {
      const aPending = a.roles.length === 0 ? 0 : 1;
      const bPending = b.roles.length === 0 ? 0 : 1;
      return aPending - bPending;
    });
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  async function setPrimaryRole(row: Row, newRole: PrimaryRole | "") {
    setSavingId(row.id);
    // Remove existing wsp/wd/tl roles
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", row.id)
      .in("role", ["wsp", "wd", "tl"]);
    if (delErr) {
      setSavingId(null);
      toast.error(delErr.message);
      return;
    }
    // Clear assignment fields tied to previous role
    const update: { wsp: WspCode | null; wd_code: string | null } = {
      wsp: null,
      wd_code: null,
    };
    const { error: upErr } = await supabase.from("profiles").update(update).eq("id", row.id);
    if (upErr) {
      setSavingId(null);
      toast.error(upErr.message);
      return;
    }
    if (newRole) {
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: row.id, role: newRole });
      if (insErr) {
        setSavingId(null);
        toast.error(insErr.message);
        return;
      }
    }
    setSavingId(null);
    toast.success(newRole ? `Role set to ${newRole.toUpperCase()}` : "Role cleared");
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              wsp: null,
              wd_code: null,
              allowed_wsps: [],
              roles: [
                ...r.roles.filter((x) => x === "admin"),
                ...(newRole ? [newRole as AppRole] : []),
              ],
            }
          : r,
      ),
    );
  }

  async function updateWsp(userId: string, wsp: WspCode | null) {
    setSavingId(userId);
    const { error } = await supabase.from("profiles").update({ wsp }).eq("id", userId);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("WSP assigned");
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, wsp } : r)));
  }

  async function updateWdCode(userId: string, wd_code: string | null) {
    setSavingId(userId);
    const { error } = await supabase.from("profiles").update({ wd_code }).eq("id", userId);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("WD assigned");
    // refresh allowed_wsps after wd_code change
    await loadUsers();
  }

  async function toggleAllowedWsp(row: Row, wsp: WspCode, on: boolean) {
    if (!row.wd_code) {
      toast.error("Assign a WD code first");
      return;
    }
    setSavingId(row.id);
    if (on) {
      const { error } = await supabase
        .from("wd_assignments")
        .insert({ wd_code: row.wd_code, wsp });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        setSavingId(null);
        return toast.error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("wd_assignments")
        .delete()
        .eq("wd_code", row.wd_code)
        .eq("wsp", wsp);
      if (error) {
        setSavingId(null);
        return toast.error(error.message);
      }
    }
    setSavingId(null);
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              allowed_wsps: on
                ? Array.from(new Set([...r.allowed_wsps, wsp]))
                : r.allowed_wsps.filter((w) => w !== wsp),
            }
          : r,
      ),
    );
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    setSavingId(userId);
    if (makeAdmin) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        setSavingId(null);
        return toast.error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) {
        setSavingId(null);
        return toast.error(error.message);
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
          Assign a role and the matching entity. Users with no role see a "waiting" screen.
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
              const primary = primaryRoleOf(row.roles);
              const saving = savingId === row.id;
              const isPending = row.roles.length === 0;
              return (
                <div
                  key={row.id}
                  className={`space-y-2 rounded-xl border bg-card p-3 shadow-sm ${
                    isPending ? "border-primary/40 ring-1 ring-primary/20" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {row.display_name || row.mobile}
                        </span>
                        {isPending && (
                          <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">+91 {row.mobile}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        Role
                        <select
                          disabled={saving}
                          value={primary ?? ""}
                          onChange={(e) =>
                            setPrimaryRole(row, (e.target.value || "") as PrimaryRole | "")
                          }
                          className="rounded-md border bg-background px-2 py-1 text-xs font-bold text-foreground"
                        >
                          <option value="">— None —</option>
                          <option value="wsp">WSP</option>
                          <option value="wd">WD</option>
                          <option value="tl">TL</option>
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
                      {saving && (
                        <Loader2 className="animate-spin text-muted-foreground" size={14} />
                      )}
                    </div>
                  </div>

                  {/* Dynamic assignment per role */}
                  {primary === "wsp" && (
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assign WSP
                        </span>
                        <select
                          disabled={saving}
                          value={row.wsp ?? ""}
                          onChange={(e) =>
                            updateWsp(row.id, (e.target.value || null) as WspCode | null)
                          }
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
                        >
                          <option value="">— Select WSP —</option>
                          {WSP_OPTIONS.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {primary === "wd" && (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assign WD
                        </span>
                        <select
                          disabled={saving}
                          value={row.wd_code ?? ""}
                          onChange={(e) => updateWdCode(row.id, e.target.value || null)}
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
                        >
                          <option value="">— Select WD —</option>
                          {wdMaster.map((w) => (
                            <option key={w.wd_code} value={w.wd_code}>
                              {w.wd_code} — {w.wd_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.wd_code && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Allowed WSPs
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {WSP_OPTIONS.map((w) => {
                              const on = row.allowed_wsps.includes(w);
                              return (
                                <label
                                  key={w}
                                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${
                                    on
                                      ? "border-success/40 bg-success/10 text-success"
                                      : "bg-background text-foreground"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={saving}
                                    checked={on}
                                    onChange={(e) => toggleAllowedWsp(row, w, e.target.checked)}
                                  />
                                  {w}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {primary === "tl" && (
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assign WD / Region
                        </span>
                        <select
                          disabled={saving}
                          value={row.wd_code ?? ""}
                          onChange={(e) => updateWdCode(row.id, e.target.value || null)}
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
                        >
                          <option value="">— Select WD / Region —</option>
                          {wdMaster.map((w) => (
                            <option key={w.wd_code} value={w.wd_code}>
                              {w.wd_code} — {w.wd_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {!primary && !isRowAdmin && (
                    <p className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                      No role assigned — user will see "Waiting for role and assignment".
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
