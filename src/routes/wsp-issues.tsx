import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RotateCw,
  Clock,
  XOctagon,
  Package,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WspBadge } from "@/components/WspSelector";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { useAuth } from "@/hooks/use-auth";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { useMaterials, useStock } from "@/hooks/use-stock";
import { useWspIssues, resolveDispatchIssue, type ResolveAction } from "@/hooks/use-wsp-issues";
import { useLossesSummary } from "@/hooks/use-losses";
import { submitLossApproval } from "@/hooks/use-loss-approvals";
import { sendTransactionalEmail } from "@/lib/email/send";

const LOSS_APPROVERS = [
  "satyadeosharan.nirala@itc.in",
  "umamaheswariharini.podagatlapalli@itc.in",
  "nikitabhardwaj2000@gmail.com",
];
import { wdMaster } from "@/lib/posm-data";
import { toast } from "sonner";

export const Route = createFileRoute("/wsp-issues")({
  component: WspIssuesPage,
  head: () => ({
    meta: [
      { title: "Issues Raised by WD — POSM Tracker" },
      {
        name: "description",
        content: "Review and resolve dispatch issues reported by distributors.",
      },
    ],
  }),
});

function WspIssuesPage() {
  const { rows, loading, refresh } = useWspIssues();
  const { totalQty: lossQty, count: lossCount } = useLossesSummary();
  const { materials } = useMaterials();
  const { stock } = useStock();
  const matMap = useMemo(
    () => new Map(materials.map((m) => [m.code, m.name])),
    [materials],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-lg font-bold leading-tight">
                Issues Raised by WD
              </h2>
              <WspBadge />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Distributor-reported issues for your dispatches
            </p>
          </div>
        </div>

        <Link
          to="/losses"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] transition hover:bg-destructive/10"
        >
          <span className="font-semibold text-foreground">
            {rows.length} open {rows.length === 1 ? "issue" : "issues"}
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="text-destructive">
              {lossQty} units lost{lossCount > 0 ? ` (${lossCount})` : ""}
            </span>
          </span>
          <span className="text-[10px] font-bold uppercase text-destructive">View losses →</span>
        </Link>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading issues…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-success" size={24} />
            <p className="text-sm font-bold text-foreground">No open issues</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              When a WD flags a dispatch line, it will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <IssueCard
                key={r.id}
                row={r}
                materialName={matMap.get(r.material_code) ?? ""}
                currentStock={stock[r.material_code] ?? 0}
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

function IssueCard({
  row,
  materialName,
  currentStock,
  onChange,
}: {
  row: ReturnType<typeof useWspIssues>["rows"][number];
  materialName: string;
  currentStock: number;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<ResolveAction | "submit_loss" | null>(null);
  const [showRedispatch, setShowRedispatch] = useState(false);
  const [redispatchQty, setRedispatchQty] = useState(String(row.qty));
  const [showLossModal, setShowLossModal] = useState(false);

  const wdName =
    wdMaster.find((w) => w.wd_code === row.distributor)?.wd_name ?? row.distributor ?? "—";

  async function act(action: ResolveAction) {
    if (action === "redispatch" && !showRedispatch) {
      setShowRedispatch(true);
      return;
    }
    let qty: number | undefined;
    if (action === "redispatch") {
      qty = Number(redispatchQty);
      if (!qty || qty <= 0) {
        toast.error("Enter a valid quantity");
        return;
      }
    }
    setBusy(action);
    const { error } = await resolveDispatchIssue(row.id, action, qty);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (action === "redispatch") toast.success("Re-dispatch created, issue resolved");
    else toast.message("Kept pending");
    setShowRedispatch(false);
    await onChange();
  }

  const dateStr = row.confirmed_at
    ? new Date(row.confirmed_at).toLocaleString()
    : row.dispatch_date ?? "—";

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-sm">
        <div className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
            <Package size={16} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
                {(row.dispatch_id ?? row.id).slice(0, 8)}
              </span>
              <span className="shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                Issue
              </span>
            </div>
            <p className="truncate text-xs font-bold text-foreground">
              To <span className="text-muted-foreground">{wdName}</span>
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({row.distributor})
              </span>
            </p>
            <p className="text-[10px] text-muted-foreground">{dateStr}</p>
          </div>
          <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-right">
            <p className="font-mono text-sm font-bold text-foreground">{row.qty}</p>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <div>
            <p className="font-mono text-[11px] font-bold text-foreground">
              {row.material_code}
            </p>
            <p className="text-[10px] text-muted-foreground">{materialName}</p>
          </div>

          <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive">
            <span className="mr-1 font-bold uppercase tracking-wide text-[9px]">Reason:</span>
            {row.issue_note?.trim() || "(no reason given)"}
          </div>

          {showRedispatch && (
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Re-dispatch quantity
              </span>
              <input
                type="number"
                min={1}
                value={redispatchQty}
                onChange={(e) => setRedispatchQty(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-mono text-foreground"
              />
            </label>
          )}

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              onClick={() => setShowLossModal(true)}
              disabled={busy !== null}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-destructive/10 py-2 text-[10px] font-bold text-destructive transition active:scale-[0.98] disabled:opacity-50"
            >
              <XOctagon size={14} />
              Submit Loss
            </button>
            <button
              onClick={() => act("redispatch")}
              disabled={busy !== null}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-primary py-2 text-[10px] font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "redispatch" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RotateCw size={14} />
              )}
              {showRedispatch ? "Confirm" : "Check & Re-dispatch"}
            </button>
            <button
              onClick={() => act("keep_pending")}
              disabled={busy !== null}
              className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-muted py-2 text-[10px] font-bold text-foreground transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "keep_pending" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Clock size={14} />
              )}
              Keep Pending
            </button>
          </div>

          <p className="pt-1 text-center text-[10px] text-muted-foreground">
            Available stock at WSP:{" "}
            <span
              className={`font-mono font-bold ${
                currentStock < row.qty ? "text-destructive" : "text-foreground"
              }`}
            >
              {currentStock}
            </span>
          </p>
          <p className="text-center text-[10px] text-muted-foreground">
            Losses require approval before stock is deducted.
          </p>
        </div>
      </div>

      {showLossModal && (
        <SubmitLossModal
          movementId={row.id}
          material={`${row.material_code} · ${materialName}`}
          qty={row.qty}
          wd={`${wdName} (${row.distributor ?? "—"})`}
          onClose={() => setShowLossModal(false)}
          onDone={async () => {
            setShowLossModal(false);
            await onChange();
          }}
        />
      )}
    </>
  );
}

function SubmitLossModal({
  movementId,
  material,
  qty,
  wd,
  onClose,
  onDone,
}: {
  movementId: string;
  material: string;
  qty: number;
  wd: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const { wsp } = useEffectiveWsp();
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for the loss");
      return;
    }
    if (!proof) {
      toast.error("Please attach supporting image");
      return;
    }
    setBusy(true);
    const { approvalId, error } = await submitLossApproval(
      movementId,
      reason.trim(),
      proof.path,
    );
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    toast.success("Loss submitted for approval");

    // Notify the 3 hardcoded approvers — one email per approver, with
    // an idempotency key per recipient so retries are safe.
    if (approvalId) {
      const templateData = {
        submittedBy: user?.user_metadata?.display_name ?? user?.email ?? "—",
        submittedByRole: "WSP",
        wsp: wsp ?? undefined,
        distributor: wd,
        materialCode: material.split(" · ")[0],
        materialName: material.split(" · ")[1] ?? undefined,
        qty,
        reason: reason.trim(),
        submittedAt: new Date().toLocaleString(),
      };
      await Promise.allSettled(
        LOSS_APPROVERS.map((email) =>
          sendTransactionalEmail({
            templateName: "loss-approval-required",
            recipientEmail: email,
            idempotencyKey: `loss-approve-${approvalId}-${email}`,
            templateData,
          }),
        ),
      );
    }

    setBusy(false);
    await onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Submit loss for approval</h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Stock will only be deducted after an approver reviews.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md bg-muted/50 p-2.5 text-[11px]">
            <p className="font-bold text-foreground">{material}</p>
            <p className="text-muted-foreground">
              Qty <span className="font-mono font-bold text-foreground">{qty}</span> · {wd}
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              Reason for loss <span className="text-destructive">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Explain why this stock should be written off…"
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
            />
          </label>

          {wsp && user ? (
            <ProofImageUpload
              wsp={wsp}
              userId={user.id}
              kind="dispatch"
              value={proof}
              onChange={setProof}
              label="Supporting image *"
            />
          ) : (
            <p className="text-[11px] text-destructive">
              Cannot upload proof: WSP context missing.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-md border bg-background py-2 text-xs font-bold text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy || !reason.trim() || !proof}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-destructive py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <XOctagon size={12} />}
              Submit for approval
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
