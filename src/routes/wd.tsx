import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";
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
  ArrowLeftRight,
  Download,
  Camera,
  Image as ImageIcon,
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
import { exportWdReport } from "@/lib/export-wd-report";
import { matchesSearch } from "@/lib/search";
import { toast } from "sonner";

export const Route = createFileRoute("/wd")({
  component: WdHomePage,
  validateSearch: (s: Record<string, unknown>) => ({
    wd: typeof s.wd === "string" ? s.wd : undefined,
  }),
  head: () => ({
    meta: [
      { title: "WD — POSM Tracker" },
      { name: "description", content: "Confirm in-transit dispatches and view WD stock." },
    ],
  }),
});

type Section = "in_transit" | "stock" | "brand_images";

function WdHomePage() {
  const { profile } = useAuth();
  const { isAdmin, aeId, isTl, isTlWdReceiver, tlReceiverWd, loading: rolesLoading } = useRoles();
  const { wd: wdParam } = Route.useSearch();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("in_transit");
  const [downloading, setDownloading] = useState(false);

  // For delegated TL receivers, lock the active WD to the TL's WD regardless of URL.
  const activeWd = isTl
    ? tlReceiverWd
    : (wdParam ?? profile?.wd_code ?? null);

  // If a TL lands here without receiver delegation, kick them back to /tl.
  useEffect(() => {
    if (rolesLoading) return;
    if (isTl && !isAdmin && !isTlWdReceiver) {
      navigate({ to: "/tl", replace: true });
    }
  }, [rolesLoading, isTl, isAdmin, isTlWdReceiver, navigate]);

  const wdName = activeWd
    ? wdMaster.find((w) => w.wd_code === activeWd)?.wd_name ?? null
    : null;

  // AE name lookup for the WD header (best-effort, not blocking)
  const [aeName, setAeName] = useState<string | null>(null);
  useEffect(() => {
    if (!activeWd) {
      setAeName(null);
      return;
    }
    let alive = true;
    void (async () => {
      const { data: wd } = await supabase
        .from("hierarchy_wd")
        .select("ae_id")
        .eq("wd_code", activeWd)
        .maybeSingle();
      const aeIdRow = (wd as { ae_id?: string } | null)?.ae_id ?? null;
      if (!aeIdRow) {
        if (alive) setAeName(null);
        return;
      }
      const { data: ae } = await supabase
        .from("hierarchy_ae")
        .select("ae_name")
        .eq("ae_id", aeIdRow)
        .maybeSingle();
      if (alive) setAeName((ae as { ae_name?: string } | null)?.ae_name ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [activeWd]);

  async function downloadReport() {
    if (!activeWd) {
      toast.error("No WD selected");
      return;
    }
    setDownloading(true);
    try {
      const { filename } = await exportWdReport(activeWd);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        {/* Lightweight WD header */}
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Truck size={20} className="text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              {activeWd ? (
                <>
                  <p className="font-mono text-xs font-bold text-primary">{activeWd}</p>
                  <h2 className="truncate font-heading text-base font-bold leading-tight text-foreground">
                    {wdName ?? "WD Operations"}
                  </h2>
                  {aeName && (
                    <p className="truncate text-[11px] text-muted-foreground">AE: {aeName}</p>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-heading text-base font-bold leading-tight text-foreground">
                    WD Operations
                  </h2>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {isAdmin
                      ? "All distributors (admin)"
                      : aeId
                        ? "Pick a WD from My WDs"
                        : "No WD assigned"}
                  </p>
                </>
              )}
            </div>
            {aeId && !isAdmin && (
              <Link
                to="/my-wds"
                className="shrink-0 rounded-lg border bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted"
              >
                Switch
              </Link>
            )}
          </div>
        </div>

        {/* Compact action tiles — hidden for delegated TL receivers */}
        {!isTl && (
          <div className="grid grid-cols-3 gap-1.5">
            <ActionTile
              to="/wd-issue-tl"
              wd={activeWd}
              icon={Send}
              label="TL Allocation"
              tone="accent"
            />
            <ActionTile
              to="/wd-transfer"
              wd={activeWd}
              icon={ArrowLeftRight}
              label="Transfer"
              tone="primary"
            />
            <button
              onClick={downloadReport}
              disabled={downloading || !activeWd}
              className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center transition hover:bg-muted/40 disabled:opacity-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                {downloading ? (
                  <Loader2 size={14} className="animate-spin text-accent" />
                ) : (
                  <Download size={14} className="text-accent" />
                )}
              </div>
              <span className="text-[10px] font-bold leading-tight text-foreground">Report</span>
            </button>
          </div>
        )}

        {/* Section tabs — delegated TL only sees Dispatches */}
        {isTl ? (
          <div className="rounded-xl border bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary">
            <Inbox className="mr-1 inline" size={12} /> My SOH — delegated WD Receiver access
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-card p-1">
            <SectionBtn label="Dispatches" icon={Inbox} active={section === "in_transit"} onClick={() => setSection("in_transit")} />
            <SectionBtn label="WD Stock" icon={Boxes} active={section === "stock"} onClick={() => setSection("stock")} />
            <SectionBtn label="Stock Images" icon={ImageIcon} active={section === "brand_images"} onClick={() => setSection("brand_images")} />
          </div>
        )}

        {(isTl || section === "in_transit") && <InTransitSection wdCode={activeWd} />}
        {!isTl && section === "stock" && <WdStockSection wdCode={activeWd} />}
        {!isTl && section === "brand_images" && <BrandImagesSection wdCode={activeWd} />}

        <div className="pt-2 text-center">
          <Link to={isTl ? "/tl" : "/"} className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function ActionTile({
  to,
  wd,
  icon: Icon,
  label,
  tone,
}: {
  to: "/wd-issue-tl" | "/wd-transfer";
  wd: string | null;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  tone: "primary" | "accent";
}) {
  const bg = tone === "accent" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary";
  return (
    <Link
      to={to}
      search={wd ? ({ wd } as never) : undefined}
      className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center transition hover:bg-muted/40"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
        <Icon size={14} />
      </div>
      <span className="text-[10px] font-bold leading-tight text-foreground">{label}</span>
    </Link>
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

function InTransitSection({ wdCode }: { wdCode: string | null }) {
  const { rows, loading, refresh } = useDispatchesForWd("in_transit", wdCode);
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [query, setQuery] = useState("");

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

  const counts = useMemo(() => {
    let pend = 0, done = 0;
    for (const g of groups) {
      const parents = g.items.filter((i) => !i.parent_movement_id);
      const allDone = parents.every((i) => i.item_status !== "pending");
      if (allDone) done++; else pend++;
    }
    return { all: groups.length, pending: pend, done };
  }, [groups]);

  const visible = useMemo(() => {
    const q = query.trim();
    return groups.filter((g) => {
      const parents = g.items.filter((i) => !i.parent_movement_id);
      const allDone = parents.every((i) => i.item_status !== "pending");
      if (filter === "pending" && allDone) return false;
      if (filter === "done" && !allDone) return false;
      if (!q) return true;
      if (matchesSearch(q, g.wsp, g.dispatch_id)) return true;
      return g.items.some((it) =>
        matchesSearch(q, it.material_code, matMap.get(it.material_code) ?? ""),
      );
    });
  }, [groups, filter, query, matMap]);

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
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["all", "All", counts.all],
          ["pending", "Pending", counts.pending],
          ["done", "Done", counts.done],
        ] as const).map(([k, l, n]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {l} <span className="ml-1 opacity-70">{n}</span>
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search WSP, material…"
          className="ml-auto min-w-[140px] flex-1 rounded-full border bg-card px-3 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-[11px] text-muted-foreground">
          No dispatches match this filter.
        </p>
      ) : (
        visible.map((g) => (
          <DispatchCard key={g.dispatch_id} group={g} matMap={matMap} onChange={refresh} />
        ))
      )}
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
  const hasPending = group.items.some((i) => i.item_status === "pending" && !i.parent_movement_id);
  const [open, setOpen] = useState(hasPending);
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

function WdStockSection({ wdCode }: { wdCode: string | null }) {
  const { stock, loading } = useWdStock(wdCode);
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);
  const [query, setQuery] = useState("");
  const total = stock.reduce((s, r) => s + r.qty, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock
      .slice()
      .sort((a, b) => a.material_code.localeCompare(b.material_code))
      .filter((r) => {
        if (!q) return true;
        return (
          r.material_code.toLowerCase().includes(q) ||
          (matMap.get(r.material_code) ?? "").toLowerCase().includes(q)
        );
      });
  }, [stock, query, matMap]);

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
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search material code or name…"
        className="w-full rounded-lg border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
            No matching stock.
          </p>
        ) : (
          filtered.map((r) => (
            <div key={r.material_code} className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 transition active:scale-[0.99]">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-bold text-foreground">{r.material_code}</p>
                <p className="truncate text-[11px] text-muted-foreground">{matMap.get(r.material_code) ?? ""}</p>
              </div>
              <div className="shrink-0 rounded-lg bg-success/10 px-2.5 py-1 text-right text-success">
                <p className="text-sm font-bold leading-tight">{r.qty}</p>
                <p className="text-[9px] font-semibold uppercase leading-tight">units</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────── ASSIGNMENTS ──────────────────────────────────

const WSP_OPTIONS = ["CEVL", "CEVJ", "CEVY"] as const;

function AssignmentsSection({ wdCode: activeWd }: { wdCode: string | null }) {
  const { isAdmin } = useRoles();
  // Admin: pick which WD to manage. Otherwise: locked to active WD context.
  const [adminWd, setAdminWd] = useState<string>(activeWd ?? "");
  const effectiveWd = isAdmin ? adminWd : activeWd ?? "";
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
            value={adminWd}
            onChange={(e) => setAdminWd(e.target.value)}
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

// ────────────────────────────────── BRAND IMAGES ──────────────────────────────────

const BRANDS = [
  "American Club",
  "Berkeley",
  "Classic",
  "Duke",
  "Goldflake",
  "Players",
  "Wave",
  "Wills Flake",
  "Others",
] as const;

const VERIFY_DAYS = 15;

type BrandImage = {
  id: string;
  wd_code: string;
  brand: string;
  image_path: string | null;
  uploaded_at: string;
  uploaded_by: string;
  no_stock: boolean;
};

function verifyState(uploadedAt: string | null | undefined) {
  if (!uploadedAt) return { status: "never" as const, daysSince: null as number | null };
  const days = Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86400000);
  if (days >= VERIFY_DAYS) return { status: "overdue" as const, daysSince: days };
  if (days >= VERIFY_DAYS - 3) return { status: "due_soon" as const, daysSince: days };
  return { status: "ok" as const, daysSince: days };
}

function BrandImagesSection({ wdCode }: { wdCode: string | null }) {
  const { isAdmin, isAe } = useRoles();
  const { user } = useAuth();
  const canEdit = (isAdmin || isAe) && !!wdCode;
  const [rows, setRows] = useState<BrandImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const refresh = useMemo(
    () => async () => {
      if (!wdCode) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("wd_brand_images")
        .select("id, wd_code, brand, image_path, uploaded_at, uploaded_by, no_stock")
        .eq("wd_code", wdCode);
      if (error) {
        toast.error(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as BrandImage[]);
      }
      setLoading(false);
    },
    [wdCode],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function publicUrl(path: string) {
    return supabase.storage.from("wd-brand-images").getPublicUrl(path).data.publicUrl;
  }

  async function handleCapture(brand: string, file: File) {
    if (!wdCode || !user) return;
    setUploading(brand);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${wdCode}/${brand.replace(/\s+/g, "_")}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("wd-brand-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { error: dbErr } = await supabase
        .from("wd_brand_images")
        .upsert(
          {
            wd_code: wdCode,
            brand,
            image_path: path,
            no_stock: false,
            uploaded_by: user.id,
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: "wd_code,brand" },
        );
      if (dbErr) {
        toast.error(dbErr.message);
        return;
      }
      toast.success(`${brand} verified`);
      await refresh();
    } finally {
      setUploading(null);
    }
  }

  async function handleNoStock(brand: string) {
    if (!wdCode || !user) return;
    setUploading(brand);
    try {
      const { error: dbErr } = await supabase
        .from("wd_brand_images")
        .upsert(
          {
            wd_code: wdCode,
            brand,
            image_path: null,
            no_stock: true,
            uploaded_by: user.id,
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: "wd_code,brand" },
        );
      if (dbErr) {
        toast.error(dbErr.message);
        return;
      }
      toast.success(`${brand} marked: no stock`);
      await refresh();
    } finally {
      setUploading(null);
    }
  }

  if (!wdCode) {
    return (
      <p className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        Select a WD to manage stock images.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </div>
    );
  }

  const byBrand = new Map(rows.map((r) => [r.brand, r]));
  const overdueCount = BRANDS.filter((b) => {
    const r = byBrand.get(b);
    return verifyState(r?.uploaded_at).status === "overdue" || verifyState(r?.uploaded_at).status === "never";
  }).length;

  return (
    <div className="space-y-2">
      {overdueCount > 0 && (
        <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ {overdueCount} brand{overdueCount > 1 ? "s" : ""} pending verification (15-day cycle).
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Verify each brand every {VERIFY_DAYS} days. {canEdit ? "Take a photo or mark no stock." : "View only."}
      </p>
      <div className="space-y-2">
        {BRANDS.map((brand) => {
          const row = byBrand.get(brand);
          return (
            <BrandImageCard
              key={brand}
              brand={brand}
              row={row}
              publicUrl={row?.image_path ? publicUrl(row.image_path) : null}
              canEdit={canEdit}
              uploading={uploading === brand}
              onCapture={(f) => handleCapture(brand, f)}
              onNoStock={() => handleNoStock(brand)}
            />
          );
        })}
      </div>
    </div>
  );
}

function BrandImageCard({
  brand,
  row,
  publicUrl,
  canEdit,
  uploading,
  onCapture,
  onNoStock,
}: {
  brand: string;
  row: BrandImage | undefined;
  publicUrl: string | null;
  canEdit: boolean;
  uploading: boolean;
  onCapture: (file: File) => void;
  onNoStock: () => void;
}) {
  const inputId = `brand-img-${brand.replace(/\s+/g, "-")}`;
  const v = verifyState(row?.uploaded_at);
  const statusBadge =
    v.status === "never"
      ? { label: "Pending Verification", cls: "bg-amber-100 text-amber-900 border-amber-300" }
      : v.status === "overdue"
        ? { label: `Overdue · ${v.daysSince}d`, cls: "bg-destructive/10 text-destructive border-destructive/30" }
        : v.status === "due_soon"
          ? { label: `Due soon · ${v.daysSince}d`, cls: "bg-amber-100 text-amber-900 border-amber-300" }
          : { label: `Verified · ${v.daysSince}d ago`, cls: "bg-emerald-100 text-emerald-900 border-emerald-300" };

  return (
    <div className="rounded-xl border bg-card p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{brand}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>
      {row?.no_stock ? (
        <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/20 text-[11px] font-semibold text-muted-foreground">
          No stock available · {new Date(row.uploaded_at).toLocaleDateString()}
        </div>
      ) : publicUrl ? (
        <a href={publicUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={publicUrl}
            alt={brand}
            className="max-h-48 w-full rounded-lg border object-contain bg-muted"
          />
        </a>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/20 text-[11px] text-muted-foreground">
          No photo uploaded
        </div>
      )}
      {canEdit && (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCapture(f);
              e.target.value = "";
            }}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label
              htmlFor={inputId}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {row?.image_path ? "Retake" : "Take Photo"}
            </label>
            <button
              type="button"
              onClick={onNoStock}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              No stock available
            </button>
          </div>
        </>
      )}
    </div>
  );
}
