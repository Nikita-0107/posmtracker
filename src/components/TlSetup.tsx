import { useState } from "react";
import { Loader2, IdCard, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { toast } from "sonner";

export function TlSetupScreen() {
  const { profile, signOut } = useAuth();
  const { tlPendingWd, refresh } = useRoles();
  const [tlId, setTlId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function submit() {
    const n = Number(tlId);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid TL ID");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("tl_submit_setup", { _legacy_tl_id: n });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("TL ID saved");
    await refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <div className="mx-auto max-w-md pt-8">
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IdCard size={20} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {tlPendingWd ? (
              <>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Waiting for WD assignment
                </h2>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Your TL ID has been saved. An admin will assign you to a WD shortly.
                  You'll get full access as soon as that's done.
                </p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-60"
                >
                  <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "Checking…" : "Refresh status"}
                </button>
              </>
            ) : (
              <>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Complete Your TL Setup
                </h2>
                {profile?.display_name && (
                  <p className="text-xs font-semibold text-foreground">
                    Hi {profile.display_name},
                  </p>
                )}
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Enter your TL ID to link your account. Example: <strong>32285</strong>.
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={tlId}
                  onChange={(e) => setTlId(e.target.value)}
                  placeholder="TL ID"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-bold text-foreground"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !tlId}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-60"
                >
                  {submitting && <Loader2 className="animate-spin" size={14} />}
                  Save TL ID
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-muted-foreground/20 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
