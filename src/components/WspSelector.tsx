import { Building2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";

/**
 * Shows the active WSP context. For Super Admins this reflects the
 * selected (viewing) WSP rather than their personal profile WSP.
 *
 * Hidden for Super Admins on the WSP dashboard, where the inline
 * switcher already shows the active WSP — avoids duplicate indicators.
 */
export function WspBadge({ hideForSuperAdmin = false }: { hideForSuperAdmin?: boolean } = {}) {
  const { profile } = useAuth();
  const { isWsp, isWspAdmin, isWdAdmin, isTl, isSuperAdmin } = useRoles();
  const { wsp: effectiveWsp } = useEffectiveWsp();

  const wsp = effectiveWsp ?? profile?.wsp ?? null;

  if (isSuperAdmin && hideForSuperAdmin) return null;

  if (wsp) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
        <Building2 size={10} /> {wsp}
      </span>
    );
  }

  // No WSP assigned — only warn WSP-side users.
  const isWspSide = (isWsp || isWspAdmin) && !isWdAdmin && !isTl && !isSuperAdmin;
  if (!isWspSide) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
      <AlertTriangle size={10} /> No WSP
    </span>
  );
}
