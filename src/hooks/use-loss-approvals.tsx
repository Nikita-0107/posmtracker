import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type LossApprovalStatus = "pending" | "approved" | "rejected";

export type LossApprovalRow = {
  id: string;
  movement_id: string;
  wsp: string;
  distributor: string | null;
  material_code: string;
  qty: number;
  reason: string;
  proof_image_path: string | null;
  submitted_by: string;
  submitted_by_role: string | null;
  submitted_at: string;
  status: LossApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_remarks: string | null;
};

const APPROVER_EMAILS = new Set([
  "satyadeosharan.nirala@itc.in",
  "umamaheswariharini.podagatlapalli@itc.in",
  "nikitabhardwaj2000@gmail.com",
]);

/** True if the current user is a super admin OR one of the hardcoded loss approvers. */
export function useIsLossApprover() {
  const { user } = useAuth();
  const [isApprover, setIsApprover] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function check() {
      if (!user) {
        setIsApprover(false);
        setLoading(false);
        return;
      }
      const email = (user.email ?? "").toLowerCase();
      if (APPROVER_EMAILS.has(email)) {
        if (alive) {
          setIsApprover(true);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!alive) return;
      setIsApprover(Boolean(data));
      setLoading(false);
    }
    void check();
    return () => {
      alive = false;
    };
  }, [user]);

  return { isApprover, loading };
}

export function useLossApprovals(status: LossApprovalStatus | "all" = "pending") {
  const { user } = useAuth();
  const [rows, setRows] = useState<LossApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("loss_approvals")
      .select(
        "id, movement_id, wsp, distributor, material_code, qty, reason, proof_image_path, submitted_by, submitted_by_role, submitted_at, status, decided_by, decided_at, decision_remarks",
      )
      .order("submitted_at", { ascending: false })
      .limit(500);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      console.error("Failed to load loss approvals", error);
      setRows([]);
    } else {
      setRows((data ?? []) as LossApprovalRow[]);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    void refresh();
    const channel = supabase
      .channel(`loss-approvals-${status}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loss_approvals" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, user, status]);

  return { rows, loading, refresh };
}

/** Lightweight count of pending approvals for the bell badge on the approver dashboard. */
export function usePendingApprovalsCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count: c } = await supabase
      .from("loss_approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const channel = supabase
      .channel(`loss-approvals-pending-count`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loss_approvals" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}

export async function submitLossApproval(
  movementId: string,
  reason: string,
  proofImagePath: string | null,
) {
  const { data, error } = await supabase.rpc("submit_loss_approval", {
    _movement_id: movementId,
    _reason: reason,
    _proof_image_path: proofImagePath ?? undefined,
  });
  return { approvalId: data as string | null, error };
}

export async function decideLossApproval(
  approvalId: string,
  decision: "approve" | "reject",
  remarks: string | null,
) {
  const { data, error } = await supabase.rpc("decide_loss_approval", {
    _approval_id: approvalId,
    _decision: decision,
    _remarks: remarks ?? undefined,
  });
  return { status: data as LossApprovalStatus | null, error };
}
