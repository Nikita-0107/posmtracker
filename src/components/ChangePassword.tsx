import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ChangePasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setPw(""); setPw2("");
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground"><KeyRound size={14}/> Change Password</h2>
      <div className="space-y-2">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        <button onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
          {busy && <Loader2 className="animate-spin" size={12}/>} Update Password
        </button>
      </div>
    </div>
  );
}
