import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  Send,
  Inbox,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Package,
  History,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useMaterials } from "@/hooks/use-stock";
import { useWdStock } from "@/hooks/use-wd";
import { supabase } from "@/integrations/supabase/client";
import { wdMaster } from "@/lib/posm-data";
import { matchesSearch } from "@/lib/search";
import { toast } from "sonner";

export const Route = createFileRoute("/wd-transfer")({
  component: WdTransferPage,
  validateSearch: (s: Record<string, unknown>) => ({
    wd: typeof s.wd === "string" ? s.wd : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Inter WD Transfer — POSM Tracker" },
      {
        name: "description",
        content: "Transfer POSM stock between WDs with confirmation by the receiver.",
      },
    ],
  }),
});

type TransferRow = {
  id: string;
  from_wd_code: string;
  to_wd_code: string;
  status: "pending" | "completed" | "cancelled";
  note: string | null;
  created_at: string;
  completed_at: string | null;
};

type TransferItem = {
  id: string;
  transfer_id: string;
  material_code: string;
  qty_requested: number;
  qty_confirmed: number | null;
  item_status: "pending" | "received" | "partial" | "issue";
  issue_note: string | null;
  confirmed_at: string | null;
};

type Tab = "incoming" | "outgoing" | "create" | "history";

function WdTransferPage() {
  const { profile } = useAuth();
  const { wd: wdParam } = Route.useSearch();
  const wdCode = wdParam ?? profile?.wd_code ?? null;
  const [tab, setTab] = useState<Tab>("incoming");
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: tData, error: tErr }, { data: iData, error: iErr }] = await Promise.all([
      supabase
        .from("wd_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("wd_transfer_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (tErr) console.error(tErr);
    if (iErr) console.error(iErr);
    setTransfers((tData ?? []) as TransferRow[]);
    setItems((iData ?? []) as TransferItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const incoming = useMemo(
    () => transfers.filter((t) => t.to_wd_code === wdCode && t.status === "pending"),
    [transfers, wdCode],
  );
  const outgoing = useMemo(
    () => transfers.filter((t) => t.from_wd_code === wdCode && t.status === "pending"),
    [transfers, wdCode],
  );
  const history = useMemo(
    () => transfers.filter((t) => t.status !== "pending"),
    [transfers],
  );
  const itemsByTransfer = useMemo(() => {
    const map = new Map<string, TransferItem[]>();
    for (const i of items) {
      const list = map.get(i.transfer_id) ?? [];
      list.push(i);
      map.set(i.transfer_id, list);
    }
    return map;
  }, [items]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ArrowLeftRight size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">Inter WD Transfer</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {wdCode ? `WD ${wdCode}` : "No WD assigned"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-xl border bg-card p-1">
          <TabBtn label="Incoming" icon={Inbox} count={incoming.length} active={tab === "incoming"} onClick={() => setTab("incoming")} />
          <TabBtn label="Outgoing" icon={Send} count={outgoing.length} active={tab === "outgoing"} onClick={() => setTab("outgoing")} />
          <TabBtn label="New" icon={Plus} active={tab === "create"} onClick={() => setTab("create")} />
          <TabBtn label="History" icon={History} active={tab === "history"} onClick={() => setTab("history")} />
        </div>

        {!wdCode ? (
          <EmptyState title="No WD assigned" body="Ask an admin to assign your WD code." />
        ) : loading ? (
          <p className="flex items-center justify-center gap-1.5 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : (
          <>
            {tab === "incoming" && (
              <TransferList
                transfers={incoming}
                itemsByTransfer={itemsByTransfer}
                emptyTitle="No incoming transfers"
                emptyBody="Transfers from other WDs will appear here."
                role="receiver"
                onChange={refresh}
              />
            )}
            {tab === "outgoing" && (
              <TransferList
                transfers={outgoing}
                itemsByTransfer={itemsByTransfer}
                emptyTitle="No outgoing transfers"
                emptyBody="Pending transfers you sent will appear here."
                role="sender"
                onChange={refresh}
              />
            )}
            {tab === "create" && (
              <CreateForm
                wdCode={wdCode}
                onDone={async () => {
                  await refresh();
                  setTab("outgoing");
                }}
              />
            )}
            {tab === "history" && (
              <TransferList
                transfers={history}
                itemsByTransfer={itemsByTransfer}
                emptyTitle="No completed transfers yet"
                emptyBody="Completed and cancelled transfers will appear here."
                role="history"
                wdCode={wdCode}
                onChange={refresh}
              />
            )}
          </>
        )}

        <div className="pt-2 text-center">
          <Link to="/wd" className="text-[11px] font-semibold text-muted-foreground underline">
            ← Back to WD home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

// ───────────── components ─────────────

function TabBtn({
  label,
  icon: Icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-bold transition ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon size={16} />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`absolute right-0.5 top-0.5 rounded-full px-1.5 text-[8px] font-bold ${
            active ? "bg-primary-foreground text-primary" : "bg-destructive text-destructive-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{body}</p>
    </div>
  );
}

function wdLabel(code: string): string {
  const m = wdMaster.find((w) => w.wd_code === code);
  return m ? `${code} — ${m.wd_name}` : code;
}

function TransferList({
  transfers,
  itemsByTransfer,
  emptyTitle,
  emptyBody,
  role,
  wdCode,
  onChange,
}: {
  transfers: TransferRow[];
  itemsByTransfer: Map<string, TransferItem[]>;
  emptyTitle: string;
  emptyBody: string;
  role: "sender" | "receiver" | "history";
  wdCode?: string | null;
  onChange: () => void | Promise<void>;
}) {
  if (transfers.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <div className="space-y-2.5">
      {transfers.map((t) => (
        <TransferCard
          key={t.id}
          transfer={t}
          items={itemsByTransfer.get(t.id) ?? []}
          role={role}
          wdCode={wdCode ?? null}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function statusColor(s: TransferRow["status"]) {
  if (s === "completed") return "bg-success/15 text-success";
  if (s === "cancelled") return "bg-muted text-muted-foreground";
  return "bg-primary/15 text-primary";
}

function TransferCard({
  transfer,
  items,
  role,
  wdCode,
  onChange,
}: {
  transfer: TransferRow;
  items: TransferItem[];
  role: "sender" | "receiver" | "history";
  wdCode: string | null;
  onChange: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(role !== "history");
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const directionLabel =
    role === "history" && wdCode
      ? transfer.from_wd_code === wdCode
        ? `To ${wdLabel(transfer.to_wd_code)}`
        : `From ${wdLabel(transfer.from_wd_code)}`
      : role === "sender"
        ? `To ${wdLabel(transfer.to_wd_code)}`
        : `From ${wdLabel(transfer.from_wd_code)}`;

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
              {transfer.id.slice(0, 8)}
            </span>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusColor(transfer.status)}`}>
              {transfer.status === "pending" ? "In Transit" : transfer.status}
            </span>
          </div>
          <p className="truncate text-xs font-bold text-foreground">{directionLabel}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(transfer.created_at).toLocaleDateString()} · {items.length} item
            {items.length === 1 ? "" : "s"}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-1.5 border-t bg-muted/20 p-2">
          {transfer.note && (
            <p className="rounded-md bg-card px-2 py-1.5 text-[11px] italic text-muted-foreground">
              "{transfer.note}"
            </p>
          )}
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              matName={matMap.get(it.material_code) ?? "—"}
              role={role}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function itemBadge(s: TransferItem["item_status"]) {
  if (s === "received") return { label: "Received", cls: "bg-success/15 text-success" };
  if (s === "partial") return { label: "Partial", cls: "bg-warning/20 text-warning" };
  if (s === "issue") return { label: "Issue", cls: "bg-destructive/15 text-destructive" };
  return { label: "Pending", cls: "bg-muted text-muted-foreground" };
}

function ItemRow({
  item,
  matName,
  role,
  onChange,
}: {
  item: TransferItem;
  matName: string;
  role: "sender" | "receiver" | "history";
  onChange: () => void | Promise<void>;
}) {
  const [popup, setPopup] = useState<null | "partial" | "issue">(null);
  const [busy, setBusy] = useState(false);
  const badge = itemBadge(item.item_status);

  async function confirm(action: "received" | "partial" | "issue", qty?: number, note?: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("confirm_wd_transfer_item", {
        _item_id: item.id,
        _action: action,
        _confirmed_qty: qty ?? undefined,
        _note: note ?? undefined,
      });
      if (error) throw new Error(error.message);
      toast.success("Saved");
      setPopup(null);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-bold text-foreground">
              {item.material_code}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{matName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-bold text-foreground">{item.qty_requested}</p>
            {item.qty_confirmed !== null && item.qty_confirmed !== item.qty_requested && (
              <p className="text-[9px] text-muted-foreground">conf {item.qty_confirmed}</p>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.cls}`}>
            {badge.label}
          </span>
          {item.issue_note && (
            <span className="truncate text-[10px] italic text-muted-foreground">
              {item.issue_note}
            </span>
          )}
        </div>

        {role === "receiver" && item.item_status === "pending" && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              onClick={() => confirm("received")}
              disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md bg-success py-1.5 text-[10px] font-bold text-success-foreground transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Full
            </button>
            <button
              onClick={() => setPopup("partial")}
              disabled={busy}
              className="rounded-md bg-warning/15 py-1.5 text-[10px] font-bold text-warning transition active:scale-[0.98] disabled:opacity-50"
            >
              Partial
            </button>
            <button
              onClick={() => setPopup("issue")}
              disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md bg-destructive/10 py-1.5 text-[10px] font-bold text-destructive transition active:scale-[0.98] disabled:opacity-50"
            >
              <AlertTriangle size={11} /> Issue
            </button>
          </div>
        )}
      </div>

      {popup && (
        <ConfirmPopup
          mode={popup}
          maxQty={item.qty_requested}
          materialCode={item.material_code}
          submitting={busy}
          onClose={() => setPopup(null)}
          onSubmit={(qty, note) => confirm(popup, qty, note)}
        />
      )}
    </>
  );
}

function ConfirmPopup({
  mode,
  maxQty,
  materialCode,
  submitting,
  onClose,
  onSubmit,
}: {
  mode: "partial" | "issue";
  maxQty: number;
  materialCode: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (qty: number | undefined, note: string | undefined) => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const numQty = Number(qty);
  const valid =
    mode === "issue"
      ? note.trim().length > 0
      : Number.isFinite(numQty) && numQty > 0 && numQty < maxQty;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-4 shadow-2xl">
        <div>
          <p className="text-sm font-bold text-foreground">
            {mode === "partial" ? "Accept partial qty" : "Report issue"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {materialCode} · requested {maxQty}
          </p>
        </div>

        {mode === "partial" && (
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-foreground">
              Received qty (less than {maxQty})
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty - 1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 5"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-foreground">
            {mode === "issue" ? "Reason (required)" : "Note (optional)"}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={mode === "issue" ? "e.g. Damaged on arrival" : "Optional note…"}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border px-3 py-2 text-xs font-bold text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit(mode === "partial" ? numQty : undefined, note.trim() || undefined)
            }
            disabled={!valid || submitting}
            className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── create form ─────────────

type DraftLine = { material_code: string; qty: string };

function CreateForm({
  wdCode,
  onDone,
}: {
  wdCode: string;
  onDone: () => void | Promise<void>;
}) {
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);
  const { stock, loading: stockLoading } = useWdStock();
  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stock) m.set(r.material_code, r.qty);
    return m;
  }, [stock]);

  const availableMaterials = useMemo(
    () => stock.filter((s) => s.qty > 0).sort((a, b) => a.material_code.localeCompare(b.material_code)),
    [stock],
  );

  const wdOptions = useMemo(
    () => wdMaster.filter((w) => w.wd_code !== wdCode).sort((a, b) => a.wd_code.localeCompare(b.wd_code)),
    [wdCode],
  );

  const [toWd, setToWd] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<{ idx: number | null } | null>(null);

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function openAddPicker() {
    setPicker({ idx: null });
  }
  function openEditPicker(idx: number) {
    setPicker({ idx });
  }
  function handlePickerSave(materialCode: string, qty: number) {
    setLines((prev) => {
      if (picker?.idx === null || picker?.idx === undefined) {
        return [...prev, { material_code: materialCode, qty: String(qty) }];
      }
      return prev.map((l, i) =>
        i === picker.idx ? { material_code: materialCode, qty: String(qty) } : l,
      );
    });
    setPicker(null);
  }

  const usedCodes = new Set(lines.map((l) => l.material_code).filter(Boolean));

  const validLines = lines
    .map((l) => ({ material_code: l.material_code, qty: Number(l.qty) }))
    .filter(
      (l) =>
        l.material_code &&
        Number.isFinite(l.qty) &&
        l.qty > 0 &&
        l.qty <= (stockMap.get(l.material_code) ?? 0),
    );
  const valid = !!toWd && validLines.length > 0 && validLines.length === lines.length;

  // Disabled-state guidance
  const guidance = !toWd
    ? "Select a destination WD to continue"
    : lines.length === 0
      ? "Add at least one material to continue"
      : !valid
        ? "Fix quantity issues to continue"
        : "";

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("create_wd_transfer", {
        _to_wd_code: toWd,
        _items: validLines,
        _note: note.trim() || undefined,
      });
      if (error) throw new Error(error.message);
      toast.success("Transfer created");
      setToWd("");
      setNote("");
      setLines([]);
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create transfer");
    } finally {
      setSubmitting(false);
    }
  }

  if (stockLoading) {
    return (
      <p className="flex items-center justify-center gap-1.5 py-8 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading stock…
      </p>
    );
  }

  if (availableMaterials.length === 0) {
    return (
      <EmptyState
        title="No stock available to transfer"
        body="You need at least one material in WD stock to create a transfer."
      />
    );
  }


  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-foreground">Send to WD</span>
          <select
            value={toWd}
            onChange={(e) => setToWd(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select destination WD…</option>
            {wdOptions.map((w) => (
              <option key={w.wd_code} value={w.wd_code}>
                {w.wd_code} — {w.wd_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-bold text-foreground">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. urgent for tomorrow's activation"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Items to transfer ({lines.length})
        </p>

        {lines.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center">
            <Package size={22} className="mx-auto mb-1.5 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">
              Add at least one material to continue
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Pick from your current WD stock.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {lines.map((l, idx) => {
              const available = stockMap.get(l.material_code) ?? 0;
              const numQty = Number(l.qty);
              const tooMuch = Number.isFinite(numQty) && numQty > available;
              return (
                <div key={idx} className="rounded-xl border bg-card p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] font-bold text-foreground">
                        {l.material_code}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {matMap.get(l.material_code) ?? "—"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Available: <span className="font-semibold text-foreground">{available}</span>
                        {" · "}
                        Selected:{" "}
                        <span className={`font-semibold ${tooMuch ? "text-destructive" : "text-foreground"}`}>
                          {l.qty || 0}
                        </span>
                        {tooMuch && <span className="ml-1 text-destructive">(exceeds stock)</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={() => openEditPicker(idx)}
                        className="rounded-md border px-2 py-1 text-[10px] font-bold text-foreground hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeLine(idx)}
                        className="flex items-center justify-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={openAddPicker}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus size={14} /> {lines.length === 0 ? "Add items to transfer" : "Add another material"}
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          onClick={submit}
          disabled={!valid || submitting}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Stock
        </button>
        {!valid && guidance && (
          <p className="text-center text-[10px] font-semibold text-muted-foreground">
            {guidance}
          </p>
        )}
      </div>

      {picker && (
        <MaterialPicker
          availableMaterials={availableMaterials}
          matMap={matMap}
          usedCodes={usedCodes}
          existing={picker.idx !== null ? lines[picker.idx] : null}
          onClose={() => setPicker(null)}
          onSave={handlePickerSave}
        />
      )}
    </div>
  );
}

// ───────────── material picker ─────────────

function MaterialPicker({
  availableMaterials,
  matMap,
  usedCodes,
  existing,
  onClose,
  onSave,
}: {
  availableMaterials: { material_code: string; qty: number }[];
  matMap: Map<string, string>;
  usedCodes: Set<string>;
  existing: DraftLine | null;
  onClose: () => void;
  onSave: (materialCode: string, qty: number) => void;
}) {
  const isEdit = existing !== null;
  const [selected, setSelected] = useState<string>(existing?.material_code ?? "");
  const [qty, setQty] = useState<string>(existing?.qty ?? "");
  const [search, setSearch] = useState("");

  const selectableMaterials = useMemo(() => {
    return availableMaterials.filter((s) => {
      if (usedCodes.has(s.material_code) && s.material_code !== existing?.material_code) {
        return false;
      }
      return matchesSearch(search, s.material_code, matMap.get(s.material_code) ?? "");
    });
  }, [availableMaterials, usedCodes, existing, search, matMap]);

  const selectedAvail =
    availableMaterials.find((s) => s.material_code === selected)?.qty ?? 0;
  const numQty = Number(qty);
  const valid =
    !!selected && Number.isFinite(numQty) && numQty > 0 && numQty <= selectedAvail;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-4 shadow-2xl">
        <div>
          <p className="text-sm font-bold text-foreground">
            {isEdit ? "Edit material" : "Add material to transfer"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Showing materials currently in your WD stock.
          </p>
        </div>

        {!isEdit && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name…"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {selectableMaterials.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              No matching materials in stock.
            </p>
          ) : (
            <div className="space-y-1">
              {selectableMaterials.map((s) => {
                const active = selected === s.material_code;
                return (
                  <button
                    key={s.material_code}
                    onClick={() => setSelected(s.material_code)}
                    className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] font-bold text-foreground">
                        {s.material_code}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {matMap.get(s.material_code) ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                      {s.qty} avail
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-2">
            <p className="text-[10px] font-semibold text-muted-foreground">
              Quantity to send (max {selectedAvail})
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={selectedAvail}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 10"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-xs font-bold text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selected, numQty)}
            disabled={!valid}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {isEdit ? "Update" : "Add to transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}
