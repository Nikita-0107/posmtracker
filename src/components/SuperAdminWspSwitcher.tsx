import { Building2 } from "lucide-react";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import type { WspCode } from "@/hooks/use-auth";

/**
 * Inline WSP switcher for Super Admins. It only changes the *viewing* context
 * — no DB writes, no permanent assignment. Hidden for non-super users.
 */
export function SuperAdminWspSwitcher() {
  const { wsp, setWsp, isSuperAdmin, options } = useEffectiveWsp();
  if (!isSuperAdmin) return null;

  return (
    <label className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
      <Building2 size={14} className="text-primary" />
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Viewing WSP
      </span>
      <select
        value={wsp ?? ""}
        onChange={(e) => setWsp(e.target.value as WspCode)}
        className="ml-auto rounded-md border bg-background px-2 py-1 text-xs font-bold text-foreground"
      >
        {options.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    </label>
  );
}
