import { Building2 } from "lucide-react";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import type { WspCode } from "@/hooks/use-auth";

/**
 * Inline WSP switcher for Super Admins. Sets the effective viewing context
 * — no DB writes. Hidden for non-super users.
 */
export function SuperAdminWspSwitcher() {
  const { wsp, setWsp, isSuperAdmin, options } = useEffectiveWsp();
  if (!isSuperAdmin) return null;

  return (
    <label className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 shadow-sm">
      <Building2 size={16} className="text-primary" />
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Current WSP
      </span>
      <select
        value={wsp ?? ""}
        onChange={(e) => setWsp(e.target.value as WspCode)}
        className="ml-auto rounded-md border border-primary/40 bg-background px-3 py-1.5 text-sm font-bold text-primary"
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
