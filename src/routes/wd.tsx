import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo, useState } from "react";
import {
  Truck,
  Boxes,
  Users,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Inbox,
  Package,
  ChevronDown,
  ChevronUp,
  Send,
  ChevronRight,
  ArrowLeftRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useMaterials } from "@/hooks/use-stock";
import {
  useDispatchesForWd,
  useWdStock,
  useWdAssignments,
  confirmDispatchItem,
  type InTransitMovement,
} from "@/hooks/use-wd";
import { supabase } from "@/integrations/supabase/client";
import { wdMaster } from "@/lib/posm-data";
import { toast } from "sonner";

export const Route = createFileRoute("/wd")({
  component: WdHomePage,
  head: () => ({
    meta: [
      { title: "WD — POSM Tracker" },
      { name: "description", content: "Confirm in-transit dispatches and view WD stock." },
    ],
  }),
});

type Section = "in_transit" | "stock" | "assignments";

function WdHomePage() {
  const { profile } = useAuth();
  const { isAdmin } = useRoles();
  const [section, setSection] = useState<Section>("in_transit");

  const wdLabel = profile?.wd_code
    ? `${profile.wd_code}${
        wdMaster.find((w) => w.wd_code === profile.wd_code)?.wd_name
          ? ` — ${wdMaster.find((w) => w.wd_code === profile.wd_code)!.wd_name}`
          : ""
      }`
    : isAdmin
      ? "All distributors (admin)"
      : "No WD assigned";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <Truck size={20} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold leading-tight">WD Operations</h2>
            <p className="truncate text-[11px] text-muted-foreground">{wdLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-card p-1">
          <SectionBtn label="In Transit" icon={Inbox} active={section === "in_transit"} onClick={() => setSection("in_transit")} />
          <SectionBtn label="WD Stock" icon={Boxes} active={section === "stock"} onClick={() => setSection("stock")} />
          <SectionBtn label="Assignments" icon={Users} active={section === "assignments"} onClick={() => setSection("assignments")} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/wd-issue-tl"
            className="flex items-center gap-2 rounded-xl border bg-card p-3 transition hover:bg-muted/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <Send size={16} className="text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-tight">Weekly TL Allocation</p>
              <p className="text-[10px] text-muted-foreground">Allocate & verify</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-muted-foreground" />
          </Link>
          <Link
            to="/wd-stock-track"
            className="flex items-center gap-2 rounded-xl border bg-card p-3 transition hover:bg-muted/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Boxes size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-tight">Stock Tracking</p>
              <p className="text-[10px] text-muted-foreground">WD-level pilot</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-muted-foreground" />
          </Link>
        </div>

        {section === "in_transit" && <InTransitSection />}
        {section === "stock" && <WdStockSection />}
        {section === "assignments" && <AssignmentsSection />}

        <div className="pt-2 text-center">
          <Link to="/" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function SectionBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// ────────────────────────────────── IN TRANSIT ──────────────────────────────────

function InTransitSection() {
  const { rows, loading, refresh } = useDispatchesForWd("in_transit");
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  // Group by dispatch_id
  const groups = useMemo(() => {
    const map = new Map<string, InTransitMovement[]>();
    for (const r of rows) {
      const key = r.dispatch_id ?? r.id;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([id, items]) => ({
      dispatch_id: id,
      wsp: items[0]?.wsp ?? "",
      distributor: items[0]?.distributor ?? "",
      created_at: items[0]?.created_at ?? "",
      dispatch_date: items[0]?.dispatch_date ?? "",
      items,
    }));
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading in-transit dispatches…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-success" size={24} />
        <p className="text-sm font-bold text-foreground">No items in transit</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          New dispatches from WSPs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <DispatchCard key={g.dispatch_id} group={g} matMap={matMap} onChange={refresh} />
      ))}
    </div>
  );
}

function deriveStatus(items: InTransitMovement[]) {
  const recv = items.filter((i) => i.item_status === "received").length;
  const pend = items.filter((i) => i.item_status === "pending").length;
  if (pend === 0 && recv === items.length) return { label: "Received", color: "bg-success/15 text-success" };
  if (recv > 0) return { label: "Partially Received", color: "bg-amber-100 text-amber-700" };
  return { label: "In Transit", color: "bg-primary/15 text-primary" };
}

function DispatchCard({
  group,
  matMap,
  onChange,
}: {
  group: { dispatch_id: string; wsp: string; distributor: string; dispatch_date: string; items: InTransitMovement[] };
  matMap: Map<string, string>;
  onChange: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(true);
  const status = deriveStatus(group.items);
  const wdName = wdMaster.find((w) => w.wd_code === group.distributor)?.wd_name ?? group.distributor;

  // Verification progress comes straight from persisted DB state — no local drafts.
  // A "parent" pending row is unverified; rows that are 'received' or 'issue' are verified.
  // Children created by a partial split (parent_movement_id != null) are not counted —
  // they belong to a parent line that's already considered verified.
  const parentItems = group.items.filter((i) => !i.parent_movement_id);
  const verifiedCount = parentItems.filter((i) => i.item_status !== "pending").length;
  const totalCount = parentItems.length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Package size={16} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
              {group.dispatch_id.slice(0, 8)}
            </span>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${status.color}`}>
              {status.label}
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">
            From <span className="font-mono text-primary">{group.wsp}</span> →{" "}
            <span className="text-muted-foreground">{wdName}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {group.dispatch_date} · {totalCount} items
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <>
          {/* Progress bar */}
          <div className="border-t bg-muted/40 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Verification progress</span>
              <span className="text-foreground">
                {verifiedCount} / {totalCount} items
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${totalCount === 0 ? 0 : (verifiedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5 border-t bg-muted/20 p-2">
            {parentItems.map((item) => {
              // Find any sibling rows created from a partial split, so we can show received+issue together.
              const siblings = group.items.filter((r) => r.parent_movement_id === item.id);
              return (
                <LineRow
                  key={item.id}
                  item={item}
                  siblings={siblings}
                  matMap={matMap}
                  onChange={onChange}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function LineRow({
  item,
  siblings,
  matMap,
  onChange,
}: {
  item: InTransitMovement;
  siblings: InTransitMovement[];
  matMap: Map<string, string>;
  onChange: () => Promise<void> | void;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPending = item.item_status === "pending";
  const isIssue = item.item_status === "issue";
  const isReceived = item.item_status === "received";

  // Sibling rows from a partial split (the issue half lives in a child row).
  const issueSibling = siblings.find((s) => s.item_status === "issue");

  async function markReceived() {
    setBusy(true);
    try {
      const { error } = await confirmDispatchItem(item.id, "received");
      if (error) throw new Error(error.message);
      toast.success("Marked as received");
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function submitIssue(receivedQty: number, reason: string) {
    setBusy(true);
    try {
      const { error } = await confirmDispatchItem(item.id, "partial", reason, receivedQty);
      if (error) throw new Error(error.message);
      toast.success("Issue saved");
      setPopupOpen(false);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save issue");
    } finally {
      setBusy(false);
    }
  }

  // Already-finalized rows: show static status (and any partial sibling).
  if (!isPending) {
    return (
      <div className="rounded-lg border bg-card p-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-bold text-foreground">
              {item.material_code}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {matMap.get(item.material_code) ?? ""}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-right">
            <p className="font-mono text-sm font-bold text-foreground">
              {item.qty + (issueSibling?.qty ?? 0)}
            </p>
          </div>
        </div>
        <div className="mt-1.5 space-y-1">
          {isReceived && (
            <div className="flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
              <CheckCircle2 size={11} /> Received ({item.qty})
            </div>
          )}
          {isIssue && (
            <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">
              <AlertTriangle size={11} /> Issue ({item.qty}): {item.issue_note || "no note"}
            </div>
          )}
          {issueSibling && (
            <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">
              <AlertTriangle size={11} /> Issue ({issueSibling.qty}):{" "}
              {issueSibling.issue_note || "no note"}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pending: show action buttons that persist on click.
  return (
    <>
      <div className="rounded-lg border bg-card p-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-bold text-foreground">
              {item.material_code}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {matMap.get(item.material_code) ?? ""}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-right">
            <p className="font-mono text-sm font-bold text-foreground">{item.qty}</p>
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={markReceived}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-md bg-success py-1.5 text-[11px] font-bold text-success-foreground transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{" "}
            Received
          </button>
          <button
            onClick={() => setPopupOpen(true)}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-md bg-destructive/10 py-1.5 text-[11px] font-bold text-destructive transition active:scale-[0.98] disabled:opacity-50"
          >
            <AlertTriangle size={12} /> Report Issue
          </button>
        </div>
      </div>

      {popupOpen && (
        <IssuePopup
          item={item}
          matMap={matMap}
          submitting={busy}
          onClose={() => setPopupOpen(false)}
          onSubmit={submitIssue}
        />
      )}
    </>
  );
}


function IssuePopup({
  item,
  matMap,
  onClose,
  onSubmit,
  submitting,
}: {
  item: InTransitMovement;
  matMap: Map<string, string>;
  onClose: () => void;
  onSubmit: (receivedQty: number, reason: string) => void;
  submitting?: boolean;
}) {
  const [issueQtyStr, setIssueQtyStr] = useState("0");
  const [reasonType, setReasonType] = useState<"shortage" | "damaged" | "mismatched" | "other">(
    "shortage",
  );
  const [otherReason, setOtherReason] = useState("");

  const total = item.qty;
  const issueQty = Math.max(0, Math.min(total, Number(issueQtyStr) || 0));
  const receivedQty = total - issueQty;

  const reason =
    reasonType === "shortage"
      ? "Shortage"
      : reasonType === "damaged"
        ? "Damaged"
        : reasonType === "mismatched"
          ? "Mismatched"
          : otherReason.trim() || "";

  const valid = issueQty > 0 && issueQty <= total && reason.length > 0;

  function submit() {
    if (!valid) return;
    onSubmit(receivedQty, reason);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle size={16} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-bold text-foreground">Report Issue</h3>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {item.material_code} · {matMap.get(item.material_code) ?? ""}
            </p>
          </div>
        </div>

        {/* Total quantity (fixed) */}
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Total Quantity (fixed)
          </p>
          <p className="font-mono text-xl font-bold text-foreground">{total}</p>
        </div>

        {/* Issue qty input */}
        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-foreground">Quantity with Issue</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={total}
            value={issueQtyStr}
            onChange={(e) => setIssueQtyStr(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-bold text-foreground"
          />
        </label>

        {/* Auto-calculated received */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-success">
            <p className="text-[9px] font-bold uppercase">Received</p>
            <p className="font-mono text-lg font-bold">{receivedQty}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
            <p className="text-[9px] font-bold uppercase">Issue</p>
            <p className="font-mono text-lg font-bold">{issueQty}</p>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-foreground">Reason</span>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["shortage", "Shortage"],
              ["damaged", "Damaged"],
              ["mismatched", "Mismatched"],
              ["other", "Other"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setReasonType(key)}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-bold transition ${
                  reasonType === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {reasonType === "other" && (
            <input
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Enter reason"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs text-foreground"
            />
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md border bg-card py-2 text-xs font-bold text-foreground transition active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="flex items-center justify-center gap-1.5 rounded-md bg-destructive py-2 text-xs font-bold text-destructive-foreground transition active:scale-[0.98] disabled:opacity-40"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Save Issue
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────── WD STOCK ──────────────────────────────────

function WdStockSection() {
  const { stock, loading } = useWdStock();
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);
  const total = stock.reduce((s, r) => s + r.qty, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading WD stock…
      </div>
    );
  }

  if (stock.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
        <Boxes className="mx-auto mb-2 text-muted-foreground" size={24} />
        <p className="text-sm font-bold text-foreground">No stock yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Stock will appear here as you confirm received items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border-2 border-accent/30 bg-accent/5 px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Total WD Stock
        </span>
        <span className="font-mono text-lg font-bold text-accent">
          {total} <span className="text-[10px] text-muted-foreground">units</span>
        </span>
      </div>
      <div className="space-y-1.5">
        {stock
          .slice()
          .sort((a, b) => a.material_code.localeCompare(b.material_code))
          .map((r) => (
            <div key={r.material_code} className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-bold text-foreground">{r.material_code}</p>
                <p className="truncate text-[11px] text-muted-foreground">{matMap.get(r.material_code) ?? ""}</p>
              </div>
              <div className="shrink-0 rounded-lg bg-success/10 px-2.5 py-1 text-right text-success">
                <p className="text-sm font-bold leading-tight">{r.qty}</p>
                <p className="text-[9px] font-semibold uppercase leading-tight">units</p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ────────────────────────────────── ASSIGNMENTS ──────────────────────────────────

const WSP_OPTIONS = ["CEVL", "CEVJ", "CEVY"] as const;

function AssignmentsSection() {
  const { isAdmin } = useRoles();
  const { profile } = useAuth();
  // Admin: pick which WD to manage. WD user: locked to own.
  const [wdCode, setWdCode] = useState<string>(profile?.wd_code ?? "");
  const effectiveWd = isAdmin ? wdCode : profile?.wd_code ?? "";
  const { assignments, loading, refresh } = useWdAssignments(effectiveWd || null);
  const [busy, setBusy] = useState(false);

  async function toggle(wsp: (typeof WSP_OPTIONS)[number], on: boolean) {
    if (!effectiveWd || !isAdmin) return;
    setBusy(true);
    if (on) {
      const { error } = await supabase
        .from("wd_assignments")
        .insert({ wd_code: effectiveWd, wsp });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        toast.error(error.message);
      }
    } else {
      const row = assignments.find((a) => a.wsp === wsp);
      if (row) {
        const { error } = await supabase.from("wd_assignments").delete().eq("id", row.id);
        if (error) toast.error(error.message);
      }
    }
    setBusy(false);
    await refresh();
  }

  return (
    <div className="space-y-3">
      {isAdmin ? (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">Managing WD</span>
          <select
            value={wdCode}
            onChange={(e) => setWdCode(e.target.value)}
            className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground"
          >
            <option value="">— Select a WD —</option>
            {wdMaster.map((w) => (
              <option key={w.wd_code} value={w.wd_code}>
                {w.wd_code} — {w.wd_name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-3 text-[11px] text-muted-foreground">
          You can see which WSPs your WD is allowed to receive from. Only an admin can change this.
        </div>
      )}

      {!effectiveWd ? (
        <p className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {isAdmin ? "Pick a WD to manage assignments." : "No WD assigned yet."}
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-1.5">
          {WSP_OPTIONS.map((wsp) => {
            const isOn = assignments.some((a) => a.wsp === wsp);
            return (
              <label
                key={wsp}
                className={`flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 ${
                  isOn ? "border-success/40 bg-success/5" : ""
                }`}
              >
                <span className="font-mono text-sm font-bold text-foreground">{wsp}</span>
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!isAdmin || busy}
                  onChange={(e) => toggle(wsp, e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
