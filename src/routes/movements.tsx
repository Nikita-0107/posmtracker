import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ImageOff,
  Loader2,
  ExternalLink,
  Search,
  Pencil,
  History,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProofImageUpload, type ProofImageValue } from "@/components/ProofImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials } from "@/hooks/use-stock";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { toast } from "sonner";
import { matchesSearch } from "@/lib/search";

type BatchType = "Launch" | "Cyclical" | "SOV" | "Others";
const BATCH_TYPES: BatchType[] = ["Launch", "Cyclical", "SOV", "Others"];

export const Route = createFileRoute("/movements")({
  component: MovementsPage,
  head: () => ({
    meta: [
      { title: "Movements — POSM Tracker" },
      {
        name: "description",
        content: "Recent stock receive and dispatch movements with proof images.",
      },
    ],
  }),
});

type Movement = {
  id: string;
  created_at: string;
  movement: "receive" | "dispatch";
  material_code: string;
  qty: number;
  distributor: string | null;
  reference_number: string | null;
  proof_image_path: string | null;
  wsp: string;
  item_status: "pending" | "received" | "issue" | string | null;
  received_date: string | null;
  batch_type: BatchType | null;
  dispatch_date: string | null;
  corrected_at: string | null;
};

type EditRow = {
  id: string;
  movement_id: string;
  old_quantity: number;
  new_quantity: number;
  edited_by: string;
  edited_at: string;
  edit_reason: string;
  editor_name?: string | null;
  old_material_code?: string | null;
  new_material_code?: string | null;
  old_received_date?: string | null;
  new_received_date?: string | null;
  old_batch_type?: string | null;
  new_batch_type?: string | null;
  old_reference_number?: string | null;
  new_reference_number?: string | null;
  old_proof_image_path?: string | null;
  new_proof_image_path?: string | null;
  old_distributor?: string | null;
  new_distributor?: string | null;
  old_dispatch_date?: string | null;
  new_dispatch_date?: string | null;
  new_movement_id?: string | null;
};

const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days (refreshed on every page load)
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MovementsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = useRoles();
  const { wsp: effectiveWsp } = useEffectiveWsp();
  const { materials } = useMaterials();
  const matMap = useMemo(() => new Map(materials.map((m) => [m.code, m.name])), [materials]);

  const [rows, setRows] = useState<Movement[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "receive" | "dispatch">("all");
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<Movement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, created_at, movement, material_code, qty, distributor, reference_number, proof_image_path, wsp, item_status, received_date, batch_type, dispatch_date, corrected_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Failed to load movements", { description: error.message });
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Movement[];
    setRows(list);
    setLoading(false);

    // Load any edit history for these movements
    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: editsData } = await supabase
        .from("stock_movement_edits")
        .select(
          "id, movement_id, old_quantity, new_quantity, edited_by, edited_at, edit_reason, old_material_code, new_material_code, old_received_date, new_received_date, old_batch_type, new_batch_type, old_reference_number, new_reference_number, old_distributor, new_distributor, old_dispatch_date, new_dispatch_date, new_movement_id",
        )
        .in("movement_id", ids)
        .order("edited_at", { ascending: false });

      const editList = (editsData ?? []) as EditRow[];
      // resolve editor names
      const editorIds = Array.from(new Set(editList.map((e) => e.edited_by)));
      const nameMap: Record<string, string | null> = {};
      if (editorIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, display_name, mobile")
          .in("id", editorIds);
        for (const p of (prof ?? []) as Array<{
          id: string;
          display_name: string | null;
          mobile: string;
        }>) {
          nameMap[p.id] = p.display_name || p.mobile;
        }
      }
      const grouped: Record<string, EditRow[]> = {};
      for (const e of editList) {
        const enriched = { ...e, editor_name: nameMap[e.edited_by] ?? "Unknown" };
        (grouped[e.movement_id] ||= []).push(enriched);
      }
      setEdits(grouped);
    } else {
      setEdits({});
    }

    // Batch sign all proof paths (1 hour)
    const paths = Array.from(
      new Set(list.map((r) => r.proof_image_path).filter((p): p is string => !!p)),
    );
    if (paths.length === 0) return;
    const { data: signedData } = await supabase.storage
      .from("proofs")
      .createSignedUrls(paths, SIGNED_TTL);
    if (!signedData) return;
    const map: Record<string, string> = {};
    for (const item of signedData) {
      if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
    }
    setSigned(map);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows.filter((r) => {
      if (effectiveWsp && r.wsp !== effectiveWsp) return false;
      if (!isSuperAdmin && r.movement !== "receive" && r.movement !== "dispatch") return false;
      if (filter !== "all" && r.movement !== filter) return false;
      if (!q) return true;
      const name = matMap.get(r.material_code) ?? "";
      return matchesSearch(q, r.material_code, name, r.reference_number, r.distributor);
    });
  }, [rows, filter, query, matMap, isSuperAdmin, effectiveWsp]);

  // Decide if a row is editable by the current WSP user
  function getEditState(r: Movement): { canEdit: boolean; reason?: string } {
    if (!profile?.wsp || profile.wsp !== r.wsp) {
      return { canEdit: false };
    }
    if (r.corrected_at) {
      return { canEdit: false, reason: "Already corrected." };
    }
    const ageMs = Date.now() - new Date(r.created_at).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      return { canEdit: false, reason: "Editing locked. Contact admin." };
    }
    if (r.movement === "dispatch" && r.item_status && r.item_status !== "pending") {
      return { canEdit: false, reason: "Already verified by WD." };
    }
    if (r.movement === "receive") {
      const laterDispatch = rows.some(
        (other) =>
          other.movement === "dispatch" &&
          other.wsp === r.wsp &&
          other.material_code === r.material_code &&
          new Date(other.created_at).getTime() > new Date(r.created_at).getTime(),
      );
      if (laterDispatch) {
        return { canEdit: false, reason: "Already dispatched. Locked." };
      }
    }
    return { canEdit: true };
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">Movements</h2>
          <p className="text-xs text-muted-foreground">
            Latest 200 entries · proofs always available
          </p>
        </div>

        <div className="flex gap-1.5">
          {(["all", "receive", "dispatch"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, ref, distributor"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-2.5 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
            No movements found.
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((r) => {
            const isReceive = r.movement === "receive";
            const url = r.proof_image_path ? signed[r.proof_image_path] : undefined;
            const editState = getEditState(r);
            const rowEdits = edits[r.id] ?? [];
            return (
              <li
                key={r.id}
                className="overflow-hidden rounded-xl border bg-card shadow-sm"
              >
                <div className="flex gap-2 p-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
                    onClick={(e) => {
                      if (!url) e.preventDefault();
                    }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt="Proof"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff size={18} className="text-muted-foreground" />
                    )}
                  </a>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          isReceive
                            ? "bg-success/15 text-success"
                            : "bg-primary/15 text-primary"
                        } ${r.corrected_at ? "line-through opacity-60" : ""}`}
                      >
                        {isReceive ? (
                          <ArrowDownToLine size={10} />
                        ) : (
                          <ArrowUpFromLine size={10} />
                        )}
                        {r.movement}
                      </span>
                      {r.corrected_at && (
                        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                          Corrected
                        </span>
                      )}
                      <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    <div className="truncate text-xs font-bold text-foreground">
                      {r.material_code}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {matMap.get(r.material_code) ?? ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        Qty <span className="font-bold text-foreground">{r.qty}</span>
                        {isReceive && r.reference_number && (
                          <> · Ref {r.reference_number}</>
                        )}
                        {!isReceive && r.distributor && (
                          <> · {r.distributor.split(/[–-]/)[0].trim()}</>
                        )}
                      </span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/20"
                        >
                          <ExternalLink size={10} /> Proof
                        </a>
                      ) : (
                        <span className="text-[10px] italic text-muted-foreground">
                          no proof
                        </span>
                      )}
                    </div>

                    {/* Action row: Edit Entry */}
                    {profile?.wsp === r.wsp && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {editState.canEdit ? (
                          <button
                            onClick={() => setEditTarget(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted"
                          >
                            <Pencil size={10} /> Edit Entry
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                            🔒 {editState.reason ?? "Locked"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Edit history */}
                    {rowEdits.length > 0 && (
                      <div className="mt-1 space-y-1 rounded-md border border-dashed border-border bg-muted/30 p-1.5">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                          <History size={10} /> Edit history
                        </div>
                        {rowEdits.map((e) => {
                          const changes: string[] = [];
                          if (e.old_quantity !== e.new_quantity)
                            changes.push(`Qty ${e.old_quantity} → ${e.new_quantity}`);
                          if (e.old_material_code && e.new_material_code && e.old_material_code !== e.new_material_code)
                            changes.push(`Material ${e.old_material_code} → ${e.new_material_code}`);
                          if (e.old_received_date !== e.new_received_date && (e.old_received_date || e.new_received_date))
                            changes.push(`Recd ${e.old_received_date ?? "—"} → ${e.new_received_date ?? "—"}`);
                          if ((e.old_batch_type ?? "") !== (e.new_batch_type ?? "") && (e.old_batch_type || e.new_batch_type))
                            changes.push(`Batch ${e.old_batch_type ?? "—"} → ${e.new_batch_type ?? "—"}`);
                          if ((e.old_reference_number ?? "") !== (e.new_reference_number ?? "") && (e.old_reference_number || e.new_reference_number))
                            changes.push(`PO ${e.old_reference_number ?? "—"} → ${e.new_reference_number ?? "—"}`);
                          if ((e.old_distributor ?? "") !== (e.new_distributor ?? "") && (e.old_distributor || e.new_distributor))
                            changes.push(`Distributor ${e.old_distributor ?? "—"} → ${e.new_distributor ?? "—"}`);
                          if ((e.old_dispatch_date ?? "") !== (e.new_dispatch_date ?? "") && (e.old_dispatch_date || e.new_dispatch_date))
                            changes.push(`Disp ${e.old_dispatch_date ?? "—"} → ${e.new_dispatch_date ?? "—"}`);
                          if ((e.old_proof_image_path ?? "") !== (e.new_proof_image_path ?? "") && (e.old_proof_image_path || e.new_proof_image_path))
                            changes.push(`Proof image updated`);
                          return (
                            <div key={e.id} className="text-[10px] leading-snug text-muted-foreground">
                              <div className="text-foreground">
                                {changes.length > 0 ? changes.join(" · ") : `Qty ${e.old_quantity} → ${e.new_quantity}`}
                              </div>
                              <div>
                                by{" "}
                                <span className="font-semibold text-foreground">
                                  {e.editor_name}
                                </span>{" "}
                                at {formatDateTime(e.edited_at)}
                              </div>
                              <div className="italic">Reason: {e.edit_reason}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {editTarget && (
        <EditEntryDialog
          movement={editTarget}
          materialName={matMap.get(editTarget.material_code) ?? ""}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function EditEntryDialog({
  movement,
  materialName,
  onClose,
  onSaved,
}: {
  movement: Movement;
  materialName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const { materials } = useMaterials();
  const isReceive = movement.movement === "receive";

  const [step, setStep] = useState<"confirm" | "form">("confirm");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editable fields
  const [newQty, setNewQty] = useState<string>(String(movement.qty));
  const [materialCode, setMaterialCode] = useState<string>(movement.material_code);
  const [materialQuery, setMaterialQuery] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState<string>(
    movement.received_date ?? new Date().toISOString().slice(0, 10),
  );
  const [batchType, setBatchType] = useState<BatchType | "">(movement.batch_type ?? "");
  const [refNumber, setRefNumber] = useState<string>(movement.reference_number ?? "");
  const [proof, setProof] = useState<ProofImageValue>(null);
  const [keepProof, setKeepProof] = useState<boolean>(true);
  const [distributor, setDistributor] = useState<string>(movement.distributor ?? "");
  const [dispatchDate, setDispatchDate] = useState<string>(
    movement.dispatch_date ?? new Date().toISOString().slice(0, 10),
  );

  const materialMatches = useMemo(() => {
    const q = materialQuery.trim();
    if (!q) return [] as { code: string; name: string }[];
    return materials
      .filter((m) => matchesSearch(q, m.code, m.name))
      .slice(0, 6);
  }, [materialQuery, materials]);

  async function submit() {
    if (reason.trim().length === 0) {
      toast.error("Reason for change is required");
      return;
    }

    if (isReceive) {
      const parsedQty = Number(newQty);
      if (!Number.isFinite(parsedQty) || parsedQty <= 0 || !Number.isInteger(parsedQty)) {
        toast.error("Enter a valid positive whole number for quantity");
        return;
      }
      if (!materialCode.trim()) {
        toast.error("Material is required");
        return;
      }
      if (!receivedDate) {
        toast.error("Received date is required");
        return;
      }
      if (receivedDate > new Date().toISOString().slice(0, 10)) {
        toast.error("Received date cannot be in the future");
        return;
      }
      if (!refNumber.trim()) {
        toast.error("PO/Reference number is required");
        return;
      }
      const proofPath = keepProof ? movement.proof_image_path : proof?.path ?? null;
      if (!proofPath) {
        toast.error("Proof image is required");
        return;
      }

      setSubmitting(true);
      const { error } = await supabase.rpc("edit_receive_entry", {
        _movement_id: movement.id,
        _new_qty: parsedQty,
        _new_material_code: materialCode.trim(),
        _new_received_date: receivedDate,
        _new_batch_type: (batchType || null) as BatchType,
        _new_reference_number: refNumber.trim(),
        _new_proof_image_path: proofPath,
        _reason: reason.trim(),
      });
      setSubmitting(false);
      if (error) {
        toast.error("Could not save edit", { description: error.message });
        return;
      }
      toast.success("Entry edited. Original marked as corrected.");
      onSaved();
    } else {
      // Dispatch entries: full edit (qty, distributor, dispatch date, proof)
      const parsed = Number(newQty);
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        toast.error("Enter a valid positive whole number for quantity");
        return;
      }
      if (!distributor.trim()) {
        toast.error("Distributor is required");
        return;
      }
      if (!dispatchDate) {
        toast.error("Dispatch date is required");
        return;
      }
      if (dispatchDate > new Date().toISOString().slice(0, 10)) {
        toast.error("Dispatch date cannot be in the future");
        return;
      }
      const proofPath = keepProof ? movement.proof_image_path : proof?.path ?? null;
      if (!proofPath) {
        toast.error("Proof image is required");
        return;
      }

      setSubmitting(true);
      const { error } = await supabase.rpc("edit_dispatch_entry", {
        _movement_id: movement.id,
        _new_qty: parsed,
        _new_distributor: distributor.trim(),
        _new_dispatch_date: dispatchDate,
        _new_proof_image_path: proofPath,
        _reason: reason.trim(),
      });
      setSubmitting(false);
      if (error) {
        toast.error("Could not save edit", { description: error.message });
        return;
      }
      toast.success("Dispatch edited. Original marked as corrected.");
      onSaved();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-3 sm:items-center">
      <div className="my-3 w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-heading text-sm font-bold">Edit Entry</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {/* Read-only current entry details */}
          <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-[11px]">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">
              Current entry
            </div>
            <div className="font-mono font-bold text-foreground">{movement.material_code}</div>
            <div className="text-muted-foreground">{materialName}</div>
            <div className="grid grid-cols-2 gap-1 pt-1 text-muted-foreground">
              <div>Qty: <span className="font-bold text-foreground">{movement.qty}</span></div>
              {isReceive ? (
                <>
                  <div>Recd: <span className="font-bold text-foreground">{movement.received_date ?? "—"}</span></div>
                  <div>Batch: <span className="font-bold text-foreground">{movement.batch_type ?? "—"}</span></div>
                  <div>PO: <span className="font-bold text-foreground">{movement.reference_number ?? "—"}</span></div>
                </>
              ) : (
                <>
                  <div>Disp date: <span className="font-bold text-foreground">{movement.dispatch_date ?? "—"}</span></div>
                  <div>Distributor: <span className="font-bold text-foreground">{movement.distributor ?? "—"}</span></div>
                </>
              )}
            </div>
          </div>

          {step === "confirm" ? (
            <>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                This will mark the original as <b>corrected</b> and create a new
                entry with your updated values. Stock will adjust automatically.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep("form")}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] font-bold uppercase text-muted-foreground">
                Updated values
              </div>

              {isReceive && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                    Material
                  </span>
                  <input
                    type="text"
                    value={materialCode}
                    onChange={(e) => {
                      setMaterialCode(e.target.value);
                      setMaterialQuery(e.target.value);
                    }}
                    placeholder="Search code or name"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  {materialMatches.length > 0 && materialQuery && materialCode !== materialQuery && (
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-popover">
                      {materialMatches.map((m) => (
                        <button
                          key={m.code}
                          type="button"
                          onClick={() => {
                            setMaterialCode(m.code);
                            setMaterialQuery("");
                          }}
                          className="block w-full truncate px-3 py-1.5 text-left text-[11px] hover:bg-muted"
                        >
                          <span className="font-mono font-bold">{m.code}</span>{" "}
                          <span className="text-muted-foreground">· {m.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                  Quantity
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>

              {isReceive && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                      Received Date
                    </span>
                    <input
                      type="date"
                      value={receivedDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                      Batch Type
                    </span>
                    <select
                      value={batchType}
                      onChange={(e) => setBatchType(e.target.value as BatchType | "")}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    >
                      <option value="">— None —</option>
                      {BATCH_TYPES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                      PO Number
                    </span>
                    <input
                      type="text"
                      value={refNumber}
                      onChange={(e) => setRefNumber(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="block text-[11px] font-semibold text-muted-foreground">
                      Proof Image
                    </span>
                    <label className="flex items-center gap-2 text-[11px] text-foreground">
                      <input
                        type="checkbox"
                        checked={keepProof}
                        onChange={(e) => setKeepProof(e.target.checked)}
                      />
                      Keep existing proof image
                    </label>
                    {!keepProof && profile?.wsp && profile?.id && (
                      <ProofImageUpload
                        wsp={profile.wsp}
                        userId={profile.id}
                        kind="receive"
                        value={proof}
                        onChange={setProof}
                        label="Upload new proof"
                      />
                    )}
                  </div>
                </>
              )}

              {!isReceive && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                      Distributor
                    </span>
                    <input
                      type="text"
                      value={distributor}
                      onChange={(e) => setDistributor(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                      Dispatch Date
                    </span>
                    <input
                      type="date"
                      value={dispatchDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDispatchDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="block text-[11px] font-semibold text-muted-foreground">
                      Proof Image
                    </span>
                    <label className="flex items-center gap-2 text-[11px] text-foreground">
                      <input
                        type="checkbox"
                        checked={keepProof}
                        onChange={(e) => setKeepProof(e.target.checked)}
                      />
                      Keep existing proof image
                    </label>
                    {!keepProof && profile?.wsp && profile?.id && (
                      <ProofImageUpload
                        wsp={profile.wsp}
                        userId={profile.id}
                        kind="dispatch"
                        value={proof}
                        onChange={setProof}
                        label="Upload new proof"
                      />
                    )}
                  </div>
                </>
              )}

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                  Reason for change <span className="text-destructive">*</span>
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Explain why this entry needs to change"
                  className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
