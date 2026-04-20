import { Building2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

/**
 * Shows the current user's WSP. There is no longer any selector — WSP comes
 * from the user's profile, assigned by an admin.
 */
export function WspBadge() {
  const { profile } = useAuth();
  if (!profile?.wsp) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
        <AlertTriangle size={10} /> No WSP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Building2 size={10} /> {profile.wsp}
    </span>
  );
}
