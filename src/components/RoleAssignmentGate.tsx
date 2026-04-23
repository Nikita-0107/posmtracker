import { AlertTriangle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";

/**
 * Renders a full "waiting" screen when:
 *  - the user has no primary role (wsp/wd/tl), OR
 *  - the user has a role but the matching entity is not assigned.
 *
 * Returns `null` (and lets the page render) when everything is in order.
 */
export function RoleAssignmentGate() {
  const { profile, loading: authLoading } = useAuth();
  const { roles, isAdmin, isWsp, isWd, isTl, loading: rolesLoading } = useRoles();

  if (authLoading || rolesLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </AppShell>
    );
  }

  // Admin always passes
  if (isAdmin) return null;

  const hasPrimary = isWsp || isWd || isTl;

  if (!hasPrimary) {
    return (
      <AppShell>
        <WaitingCard
          title="Waiting for role and assignment"
          body={`Your account ${profile?.mobile ? `(+91 ${profile.mobile})` : ""} is signed in but no role has been assigned yet. An admin needs to grant you a role (WSP, WD, or TL) before you can use the app.`}
        />
      </AppShell>
    );
  }

  // Role assigned, but entity missing
  if (isWsp && !profile?.wsp) {
    return (
      <AppShell>
        <WaitingCard
          title="Waiting for assignment"
          body="Your role is set to WSP but no WSP has been assigned to your account. Please contact an admin."
        />
      </AppShell>
    );
  }
  if (isWd && !profile?.wd_code) {
    return (
      <AppShell>
        <WaitingCard
          title="Waiting for assignment"
          body="Your role is set to WD but no WD code has been assigned to your account. Please contact an admin."
        />
      </AppShell>
    );
  }
  if (isTl && !profile?.wd_code) {
    return (
      <AppShell>
        <WaitingCard
          title="Waiting for assignment"
          body="Your role is set to TL but no WD / region has been assigned to your account. Please contact an admin."
        />
      </AppShell>
    );
  }

  // unknown future role: be safe
  if (roles.length === 0) {
    return (
      <AppShell>
        <WaitingCard
          title="Waiting for role and assignment"
          body="Your account is signed in but has no role yet. Please contact an admin."
        />
      </AppShell>
    );
  }

  return null;
}

function WaitingCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-start gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}
