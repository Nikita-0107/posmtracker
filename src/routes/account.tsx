import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ChangePasswordCard } from "@/components/ChangePassword";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { UserCog } from "lucide-react";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({ meta: [{ title: "Account — POSM Tracker" }] }),
});

function AccountPage() {
  const { profile } = useAuth();
  const { roles, aeId, tlId } = useRoles();
  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <UserCog className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">Account</h1>
        </div>
        <div className="rounded-xl border bg-card p-3 text-sm shadow-sm">
          <div><b>Name:</b> {profile?.display_name ?? "—"}</div>
          <div><b>ID:</b> <span className="font-mono">{profile?.mobile}</span></div>
          {aeId && <div><b>AE ID:</b> <span className="font-mono">{aeId}</span></div>}
          {tlId && <div><b>TL ID:</b> <span className="font-mono">{tlId}</span></div>}
          <div><b>Roles:</b> {roles.join(", ") || "—"}</div>
        </div>
        <ChangePasswordCard />
      </div>
    </AppShell>
  );
}
