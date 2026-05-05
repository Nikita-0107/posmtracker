import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ShieldCheck, Users, AlertTriangle, Loader2, Star, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { wdMaster } from "@/lib/posm-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type WspCode = "CEVL" | "CEVJ" | "CEVY";
type PrimaryRole = "wsp" | "wd" | "tl";
const WSP_OPTIONS: WspCode[] = ["CEVL", "CEVJ", "CEVY"];
const TL_TYPE_OPTIONS = ["Merch TL", "Sales TL", "Other"];

type Row = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
  wd_code: string | null;
  tl_type: string | null;
  roles: string[];
  allowed_wsps: string[];
};

type Scope = {
  is_super: boolean;
  wsp_scope: WspCode | null;
  wd_scope: string | null;
};

function primaryOf(roles: string[]): PrimaryRole | null {
  if (roles.includes("wsp")) return "wsp";
  if (roles.includes("wd")) return "wd";
  if (roles.includes("tl")) return "tl";
  return null;
}

function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("user_admin_scope", { _user_id: user.id });
      if (error) {
        console.error(error);
        setScope({ is_super: false, wsp_scope: null, wd_scope: null });
        return;
      }
      const r = (data ?? [])[0] as Scope | undefined;
      setScope(
        r ?? { is_super: false, wsp_scope: null, wd_scope: null },
      );
    })();
  }, [user, authLoading, navigate]);

  const canManageUsers =
    !!scope && (scope.is_super || !!scope.wsp_scope || !!scope.wd_scope);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_manageable_users");
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows(
      (data ?? []).map((r: Row & { allowed_wsps: string[] }) => ({
        ...r,
        allowed_wsps: r.allowed_wsps ?? [],
        roles: r.roles ?? [],
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canManageUsers) void loadUsers();
  }, [canManageUsers, loadUsers]);

  const sections = useMemo(() => {
    const supers: Row[] = [];
    const admins: Row[] = [];
    const users: Row[] = [];
    const pending: Row[] = [];
    rows.forEach((r) => {
      if (r.roles.includes("admin")) supers.push(r);
      else if (r.roles.includes("wsp") || r.roles.includes("wd")) admins.push(r);
      else if (r.roles.includes("tl")) users.push(r);
      else pending.push(r);
    });
    return { supers, admins, users, pending };
  }, [rows]);

  if (authLoading || scope === null) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </AppShell>
    );
  }

  if (!canManageUsers) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 text-destructive" size={28} />
          <h2 className="font-heading text-lg font-bold text-foreground">Access required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to manage users.
          </p>
        </div>
      </AppShell>
    );
  }

  const scopeLabel = scope.is_super
    ? "Super Admin"
    : scope.wsp_scope
      ? `WSP Admin · ${scope.wsp_scope}`
      : `WD Admin · ${scope.wd_scope}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <AdminTabs />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary" size={20} />
            <h1 className="font-heading text-lg font-bold text-foreground">User Management</h1>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {scopeLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Users sign up themselves with their mobile number. Assign each new user a role and area below.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2" size={24} />
            No users in your scope yet.
          </div>
        ) : (
          <div className="space-y-5">
            {sections.pending.length > 0 && (
              <Section
                title="Pending Setup"
                hint="New signups waiting for a role"
                tone="warn"
                rows={sections.pending}
                editingId={editingId}
                setEditingId={setEditingId}
                scope={scope}
                currentUserId={user!.id}
                reload={loadUsers}
              />
            )}
            <Section
              title="⭐ Super Admins"
              hint="Full access across the system"
              tone="amber"
              rows={sections.supers}
              editingId={editingId}
              setEditingId={setEditingId}
              scope={scope}
              currentUserId={user!.id}
              reload={loadUsers}
            />
            <Section
              title="🔵 Admins"
              hint="WSP & WD Admins"
              tone="blue"
              rows={sections.admins}
              editingId={editingId}
              setEditingId={setEditingId}
              scope={scope}
              currentUserId={user!.id}
              reload={loadUsers}
            />
            <Section
              title="⚪ Users"
              hint="Team Leads"
              tone="muted"
              rows={sections.users}
              editingId={editingId}
              setEditingId={setEditingId}
              scope={scope}
              currentUserId={user!.id}
              reload={loadUsers}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  title,
  hint,
  tone,
  rows,
  editingId,
  setEditingId,
  scope,
  currentUserId,
  reload,
}: {
  title: string;
  hint: string;
  tone: "amber" | "blue" | "muted" | "warn";
  rows: Row[];
  editingId: string | null;
  setEditingId: (v: string | null) => void;
  scope: Scope;
  currentUserId: string;
  reload: () => Promise<void>;
}) {
  if (rows.length === 0) return null;
  const headerColor =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "blue"
        ? "text-blue-600 dark:text-blue-400"
        : tone === "warn"
          ? "text-primary"
          : "text-muted-foreground";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className={`font-heading text-sm font-bold uppercase tracking-wide ${headerColor}`}>
          {title}
          <span className="ml-2 text-[11px] font-semibold text-muted-foreground">({rows.length})</span>
        </h2>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <UserRow
            key={row.id}
            row={row}
            isEditing={editingId === row.id}
            onEdit={() => setEditingId(row.id)}
            onClose={() => setEditingId(null)}
            scope={scope}
            currentUserId={currentUserId}
            reload={reload}
          />
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        <Star size={10} /> Super Admin
      </span>
    );
  if (role === "wsp")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        WSP Admin
      </span>
    );
  if (role === "wd")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        WD Admin
      </span>
    );
  if (role === "tl")
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
        TL User
      </span>
    );
  return null;
}

function UserRow({
  row,
  isEditing,
  onEdit,
  onClose,
  scope,
  currentUserId,
  reload,
}: {
  row: Row;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  scope: Scope;
  currentUserId: string;
  reload: () => Promise<void>;
}) {
  const isSuperRow = row.roles.includes("admin");
  const primary = primaryOf(row.roles);
  const isPending = row.roles.length === 0;

  // Permission to edit this row
  const canEdit =
    scope.is_super ||
    (!isSuperRow &&
      ((scope.wsp_scope &&
        (row.wsp === scope.wsp_scope ||
          row.allowed_wsps.includes(scope.wsp_scope) ||
          isPending)) ||
        (scope.wd_scope && (row.wd_code === scope.wd_scope || isPending))));

  const assignmentLabel = isSuperRow
    ? "All areas"
    : primary === "wsp"
      ? row.wsp ?? "—"
      : primary === "wd" || primary === "tl"
        ? row.wd_code ?? "—"
        : "Account under setup";

  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-sm ${
        isPending ? "border-primary/40 ring-1 ring-primary/20" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {row.display_name || row.mobile}
            </span>
            {isSuperRow && <RoleBadge role="admin" />}
            {primary && <RoleBadge role={primary} />}
            {isPending && (
              <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                Pending
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">+91 {row.mobile}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {assignmentLabel}
            {primary === "tl" && row.tl_type && ` · ${row.tl_type}`}
          </div>
        </div>
        {canEdit && !isEditing && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
          >
            <Pencil size={12} /> Change
          </button>
        )}
      </div>

      {isEditing && canEdit && (
        <EditPanel
          row={row}
          scope={scope}
          currentUserId={currentUserId}
          onClose={onClose}
          reload={reload}
        />
      )}
    </div>
  );
}

function EditPanel({
  row,
  scope,
  currentUserId,
  onClose,
  reload,
}: {
  row: Row;
  scope: Scope;
  currentUserId: string;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const isSuperRow = row.roles.includes("admin");
  const [primary, setPrimary] = useState<PrimaryRole | "">(primaryOf(row.roles) ?? "");
  const [wsp, setWsp] = useState<WspCode | "">((row.wsp as WspCode) ?? "");
  const [wdCode, setWdCode] = useState<string>(row.wd_code ?? "");
  const [tlType, setTlType] = useState<string>(row.tl_type ?? "");
  const [allowedWsps, setAllowedWsps] = useState<WspCode[]>(
    (row.allowed_wsps as WspCode[]) ?? [],
  );
  const [saving, setSaving] = useState(false);

  // Allowed role choices based on scope
  const roleChoices: PrimaryRole[] = scope.is_super
    ? ["wsp", "wd", "tl"]
    : scope.wsp_scope
      ? ["wd", "tl"]
      : ["tl"];

  // WD options visible to this admin
  const wdOptions = useMemo(() => {
    if (scope.is_super) return wdMaster;
    if (scope.wd_scope) return wdMaster.filter((w) => w.wd_code === scope.wd_scope);
    return wdMaster; // WSP admin: filter further client-side via wd_assignments isn't trivial; allow all, server enforces.
  }, [scope]);

  async function save() {
    setSaving(true);
    try {
      const role = primary || null;
      const { error } = await supabase.rpc("admin_assign_role", {
        _target: row.id,
        _role: role,
        _wsp: role === "wsp" ? wsp || null : null,
        _wd_code: role === "wd" || role === "tl" ? wdCode || null : null,
        _tl_type: role === "tl" ? tlType || null : null,
      } as never);
      if (error) throw error;

      // Sync allowed WSPs for WD users (Super Admin only)
      if (scope.is_super && role === "wd" && wdCode) {
        const desired = new Set(allowedWsps);
        const current = new Set(row.allowed_wsps);
        const toAdd = [...desired].filter((w) => !current.has(w));
        const toRemove = [...current].filter((w) => !desired.has(w as WspCode));
        if (toAdd.length) {
          await supabase
            .from("wd_assignments")
            .insert(toAdd.map((w) => ({ wd_code: wdCode, wsp: w })));
        }
        for (const w of toRemove) {
          await supabase
            .from("wd_assignments")
            .delete()
            .eq("wd_code", wdCode)
            .eq("wsp", w);
        }
      }

      toast.success("Saved");
      onClose();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSuper(on: boolean) {
    setSaving(true);
    const { error } = await supabase.rpc("admin_toggle_super_admin", {
      _target: row.id,
      _on: on,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(on ? "Granted Super Admin" : "Removed Super Admin");
    onClose();
    await reload();
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3">
      {scope.is_super && (
        <label className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
          <span className="inline-flex items-center gap-1">
            <Star size={12} /> Super Admin
          </span>
          <input
            type="checkbox"
            disabled={saving || row.id === currentUserId}
            checked={isSuperRow}
            onChange={(e) => toggleSuper(e.target.checked)}
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Role
        </span>
        <select
          disabled={saving}
          value={primary}
          onChange={(e) => setPrimary((e.target.value || "") as PrimaryRole | "")}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
        >
          <option value="">— None (account under setup) —</option>
          {roleChoices.includes("wsp") && <option value="wsp">WSP Admin</option>}
          {roleChoices.includes("wd") && <option value="wd">WD Admin</option>}
          {roleChoices.includes("tl") && <option value="tl">TL User</option>}
        </select>
      </label>

      {primary === "wsp" && (
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Assign WSP
          </span>
          <select
            disabled={saving || (!scope.is_super && !!scope.wsp_scope)}
            value={wsp}
            onChange={(e) => setWsp((e.target.value || "") as WspCode | "")}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">— Select WSP —</option>
            {(scope.is_super ? WSP_OPTIONS : [scope.wsp_scope!]).map((w) => (
              <option key={w} value={w!}>
                {w}
              </option>
            ))}
          </select>
        </label>
      )}

      {(primary === "wd" || primary === "tl") && (
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Assign WD
          </span>
          <select
            disabled={saving}
            value={wdCode}
            onChange={(e) => setWdCode(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">— Select WD —</option>
            {wdOptions.map((w) => (
              <option key={w.wd_code} value={w.wd_code}>
                {w.wd_code} — {w.wd_name}
              </option>
            ))}
          </select>
        </label>
      )}

      {primary === "wd" && wdCode && scope.is_super && (
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Allowed WSPs (which WSPs can dispatch to this WD)
          </span>
          <div className="flex flex-wrap gap-2">
            {WSP_OPTIONS.map((w) => {
              const on = allowedWsps.includes(w);
              return (
                <label
                  key={w}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${
                    on ? "border-success/40 bg-success/10 text-success" : "bg-background"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setAllowedWsps((prev) =>
                        e.target.checked ? [...prev, w] : prev.filter((x) => x !== w),
                      )
                    }
                  />
                  {w}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {primary === "tl" && (
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            TL Type
          </span>
          <select
            disabled={saving}
            value={tlType}
            onChange={(e) => setTlType(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-bold text-foreground"
          >
            <option value="">— Select type —</option>
            {TL_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-md border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
        >
          {saving && <Loader2 className="animate-spin" size={12} />} Save
        </button>
      </div>
    </div>
  );
}
