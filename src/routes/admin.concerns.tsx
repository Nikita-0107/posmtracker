import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, MessageSquareWarning, Image as ImageIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/concerns")({
  component: AdminConcernsPage,
  head: () => ({
    meta: [{ title: "Concerns to HO — Admin" }],
  }),
});

type Row = {
  id: string;
  wsp: string;
  material_code: string;
  system_qty: number;
  actual_qty: number;
  difference: number;
  reason: "shortage" | "damage" | "other";
  status: "pending" | "approved" | "rejected";
  note: string | null;
  proof_image_path: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

type Tab = "pending" | "approved" | "rejected";

function AdminConcernsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState<{ isAdmin: boolean; isWspAdmin: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const r = (data ?? []).map((x: { role: string }) => x.role);
      setAccess({ isAdmin: r.includes("admin"), isWspAdmin: r.includes("wsp_admin") });
    })();
  }, [user, authLoading, navigate]);

  const isAdmin = access?.isAdmin ?? false;
  const isWspAdmin = access?.isWspAdmin ?? false;
  const canView = isAdmin || isWspAdmin;
  const wspScope = !isAdmin && isWspAdmin ? profile?.wsp ?? null : null;

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    let q = supabase
      .from("stock_concerns")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(100);
    if (wspScope) q = q.eq("wsp", wspScope);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [canView, tab, wspScope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    if (!isAdmin) return;
    const note = action === "reject" ? window.prompt("Reason for rejection (optional):") ?? undefined : undefined;
    setActingId(id);
    const { error } = await supabase.rpc("resolve_stock_concern", {
      _concern_id: id,
      _action: action,
      _resolution_note: note ?? undefined,
    });
    setActingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(action === "approve" ? "Approved & stock adjusted" : "Rejected");
    void load();
  }

  if (authLoading || access === null) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
          <Loader2 size={14} className="mr-2 animate-spin" /> Loading…
        </div>
      </AppShell>
    );
  }

  if (!canView) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border bg-destructive/10 p-4 text-center text-sm text-destructive">
          <AlertTriangle className="mx-auto mb-2" size={20} />
          Admins only.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <AdminTabs />
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">Concerns to HO</h2>
            <p className="text-[11px] text-muted-foreground">Review WSP-reported stock concerns</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <MessageSquareWarning className="mx-auto mb-2 text-muted-foreground" size={24} />
            <p className="text-sm font-bold">No {tab} concerns</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <ConcernRow
                key={r.id}
                row={r}
                acting={actingId === r.id}
                onAct={(a) => act(r.id, a)}
              />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link to="/admin/users" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Admin home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function ConcernRow({
  row,
  acting,
  onAct,
}: {
  row: Row;
  acting: boolean;
  onAct: (a: "approve" | "reject") => void;
}) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!row.proof_image_path) return;
    supabase.storage
      .from("proofs")
      .createSignedUrl(row.proof_image_path, 300)
      .then(({ data }) => {
        if (!cancel) setProofUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancel = true;
    };
  }, [row.proof_image_path]);

  const statusUI =
    row.status === "approved"
      ? { Icon: CheckCircle2, cls: "bg-success/15 text-success", label: "Approved" }
      : row.status === "rejected"
        ? { Icon: XCircle, cls: "bg-destructive/15 text-destructive", label: "Rejected" }
        : { Icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", label: "Pending" };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {row.wsp}
            </span>
            <span className="font-mono text-[11px] font-bold">{row.material_code}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString()} · <span className="capitalize">{row.reason}</span>
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusUI.cls}`}
        >
          <statusUI.Icon size={10} /> {statusUI.label}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-muted/30 p-2">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">System</p>
          <p className="font-mono text-base font-bold">{row.system_qty}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Actual</p>
          <p className="font-mono text-base font-bold">{row.actual_qty}</p>
        </div>
        <div
          className={`rounded-lg border p-2 ${
            row.difference < 0
              ? "border-destructive/40 bg-destructive/10"
              : row.difference > 0
                ? "border-success/40 bg-success/10"
                : "bg-muted/30"
          }`}
        >
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Diff</p>
          <p
            className={`font-mono text-base font-bold ${
              row.difference < 0 ? "text-destructive" : row.difference > 0 ? "text-success" : ""
            }`}
          >
            {row.difference > 0 ? `+${row.difference}` : row.difference}
          </p>
        </div>
      </div>

      {row.note && (
        <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-[11px]">
          <span className="mr-1 text-[9px] font-bold uppercase text-muted-foreground">WSP note:</span>
          {row.note}
        </p>
      )}

      {row.resolution_note && (
        <p className="mt-1.5 rounded-md bg-muted px-2 py-1.5 text-[11px]">
          <span className="mr-1 text-[9px] font-bold uppercase text-muted-foreground">HO note:</span>
          {row.resolution_note}
        </p>
      )}

      {proofUrl && (
        <a
          href={proofUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary underline"
        >
          <ImageIcon size={12} /> View proof image
        </a>
      )}

      {row.status === "pending" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={acting}
            onClick={() => onAct("reject")}
            className="rounded-lg border-2 border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => onAct("approve")}
            className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {acting ? <Loader2 size={12} className="animate-spin" /> : null}
            Approve & adjust
          </button>
        </div>
      )}
    </div>
  );
}
