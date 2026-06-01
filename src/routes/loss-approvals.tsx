import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XOctagon,
  Package,
  ImageIcon,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useMaterials } from "@/hooks/use-stock";
import { wdMaster } from "@/lib/posm-data";
import {
  useIsLossApprover,
  useLossApprovals,
  decideLossApproval,
  type LossApprovalRow,
  type LossApprovalStatus,
} from "@/hooks/use-loss-approvals";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/loss-approvals")({
  component: LossApprovalsPage,
  head: () => ({
    meta: [
      { title: "Loss Approval Queue — POSM Tracker" },
      {
        name: "description",
        content: "Review WSP-submitted losses and approve or reject before stock is deducted.",
      },
    ],
  }),
});

const TABS: { key: LossApprovalStatus; label: string; icon: typeof Clock }[] = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", icon: XOctagon },
];

function LossApprovalsPage() {
  const { isApprover, loading: roleLoading } = useIsLossApprover();
  const [tab, setTab] = useState<LossApprovalStatus>("pending");
  const { rows, loading, refresh } = useLossApprovals(tab);
  const { materials } = useMaterials();
  const matMap = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  if (roleLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      </AppShell>
    );
  }

  if (!isApprover) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 text-muted-foreground" size={28} />
          <p className="text-sm font-bold text-foreground">Approvers only</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This area is restricted to Super Admins and designated loss approvers.
          </p>
          <Link
            to="/"
            className="mt-3 inline-block text-[11px] font-semibold text-primary underline"
          >
            ← Back to home
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">
              Loss Approval Queue
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Review losses submitted by WSP teams before stock is adjusted.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <p className="text-sm font-bold text-foreground">
              No {tab} losses
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tab === "pending"
                ? "All caught up — nothing waiting on you right now."
                : "Decisions made will appear here for audit."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <ApprovalCard
                key={r.id}
                row={r}
                materialName={matMap.get(r.material_code) ?? ""}
                onChange={refresh}
              />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            to="/"
            className="text-[11px] font-semibold text-muted-foreground underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function ApprovalCard({
  row,
  materialName,
  onChange,
}: {
  row: LossApprovalRow;
  materialName: string;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const wdName =
    wdMaster.find((w) => w.wd_code === row.distributor)?.wd_name ?? row.distributor ?? "—";
  const submittedAt = new Date(row.submitted_at).toLocaleString();
  const decidedAt = row.decided_at ? new Date(row.decided_at).toLocaleString() : null;

  async function viewProof() {
    if (!row.proof_image_path) return;
    if (imgUrl) {
      window.open(imgUrl, "_blank");
      return;
    }
    const { data } = await supabase.storage
      .from("proofs")
      .createSignedUrl(row.proof_image_path, 600);
    if (data?.signedUrl) {
      setImgUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Could not load supporting image");
    }
  }

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    const { error } = await decideLossApproval(row.id, decision, remarks.trim() || null);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(decision === "approve" ? "Loss approved" : "Loss rejected");
    await onChange();
  }

  const statusBadge =
    row.status === "pending"
      ? { label: "Pending", cls: "bg-amber-500/15 text-amber-700" }
      : row.status === "approved"
        ? { label: "Approved", cls: "bg-emerald-500/15 text-emerald-700" }
        : { label: "Rejected", cls: "bg-destructive/15 text-destructive" };

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
          <Package size={16} className="text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold text-muted-foreground">
              {row.movement_id.slice(0, 8)}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
              {row.wsp}
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">
            To <span className="text-muted-foreground">{wdName}</span>
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              ({row.distributor ?? "—"})
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">Submitted {submittedAt}</p>
        </div>
        <div className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-right">
          <p className="font-mono text-sm font-bold text-destructive">−{row.qty}</p>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <p className="font-mono text-[11px] font-bold text-foreground">{row.material_code}</p>
          <p className="text-[10px] text-muted-foreground">{materialName}</p>
        </div>

        <div className="rounded-md bg-muted px-2 py-1.5 text-[11px]">
          <span className="mr-1 font-bold uppercase tracking-wide text-[9px] text-muted-foreground">
            Reason:
          </span>
          {row.reason}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            Submitter: <span className="font-mono">{row.submitted_by.slice(0, 8)}</span>
          </span>
          {row.submitted_by_role && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">
              {row.submitted_by_role}
            </span>
          )}
          {row.proof_image_path && (
            <button
              onClick={viewProof}
              className="ml-auto flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary"
            >
              <ImageIcon size={11} /> View proof
            </button>
          )}
        </div>

        {row.status === "pending" ? (
          <>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Remarks (optional)
              </span>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={300}
                placeholder="Add a note for the audit log…"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => decide("reject")}
                disabled={busy !== null}
                className="flex items-center justify-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 py-2 text-xs font-bold text-destructive disabled:opacity-50"
              >
                {busy === "reject" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <XOctagon size={12} />
                )}
                Reject
              </button>
              <button
                onClick={() => decide("approve")}
                disabled={busy !== null}
                className="flex items-center justify-center gap-1 rounded-md bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy === "approve" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                Approve
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[10px] text-muted-foreground">
            <p>
              <span className="font-bold uppercase tracking-wide">Decision:</span>{" "}
              <span className="font-semibold text-foreground">{row.status}</span>
              {decidedAt ? <> · {decidedAt}</> : null}
              {row.decided_by ? (
                <>
                  {" "}
                  · by <span className="font-mono">{row.decided_by.slice(0, 8)}</span>
                </>
              ) : null}
            </p>
            {row.decision_remarks && (
              <p className="mt-1">
                <span className="font-bold uppercase tracking-wide">Remarks:</span>{" "}
                {row.decision_remarks}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
