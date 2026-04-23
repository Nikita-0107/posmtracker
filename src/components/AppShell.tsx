import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, Truck, Camera, LogOut, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { useRoles, type AppRole } from "@/hooks/use-roles";

const tabs = [
  { to: "/" as const, label: "WSP", icon: Building2, roles: ["wsp", "admin"] as const },
  { to: "/wd" as const, label: "WD", icon: Truck, roles: ["wd", "admin"] as const },
  { to: "/tl" as const, label: "TL", icon: Camera, roles: ["tl", "admin"] as const },
];

// Map URL prefixes to the role(s) that can view them.
const routeRoleMap: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/wd", roles: ["wd", "admin"] },
  { prefix: "/tl", roles: ["tl", "admin"] },
  { prefix: "/tl-upload", roles: ["tl", "admin"] },
  { prefix: "/receive", roles: ["wsp", "admin"] },
  { prefix: "/wd-issue", roles: ["wsp", "admin"] },
  { prefix: "/stock", roles: ["wsp", "admin"] },
  { prefix: "/movements", roles: ["wsp", "admin"] },
];

const PUBLIC_PATHS = ["/login", "/admin"];

function landingForRoles(roles: AppRole[]): "/" | "/wd" | "/tl" {
  if (roles.includes("admin") || roles.includes("wsp")) return "/";
  if (roles.includes("wd")) return "/wd";
  if (roles.includes("tl")) return "/tl";
  return "/";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, profile, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const { roles, isAdmin, loading: rolesLoading } = useRoles();

  // Filter tabs by roles
  const visibleTabs = tabs.filter((t) => t.roles.some((r) => roles.includes(r)));
  const tabsToRender = visibleTabs.length > 0 ? visibleTabs : [];

  // Redirect away from a tab the user can't access
  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) return;
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) return;
    if (isAdmin) return;
    const match = routeRoleMap.find((r) => location.pathname.startsWith(r.prefix));
    if (!match) return;
    const allowed = match.roles.some((r) => roles.includes(r));
    if (!allowed) {
      navigate({ to: landingForRoles(roles), replace: true });
    }
  }, [authLoading, rolesLoading, user, isAdmin, roles, location.pathname, navigate]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  // While auth/roles still loading, render a thin shell
  const showLoadingOverlay = (authLoading || rolesLoading) && !!user;

  // Determine if this user has any role-allowed entity assigned at all
  const hasPrimaryRole =
    isAdmin || roles.includes("wsp") || roles.includes("wd") || roles.includes("tl");
  const hasEntity =
    isAdmin ||
    (roles.includes("wsp") && !!profile?.wsp) ||
    (roles.includes("wd") && !!profile?.wd_code) ||
    (roles.includes("tl") && !!profile?.wd_code);

  const showWaitingScreen =
    !!user &&
    !authLoading &&
    !rolesLoading &&
    !PUBLIC_PATHS.some((p) => location.pathname.startsWith(p)) &&
    (!hasPrimaryRole || !hasEntity);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card px-3 py-2 shadow-sm">
        <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
          📦 POSM Tracker
        </h1>
        <div className="flex items-center gap-2">
          <WspBadge />
          {isAdmin && (
            <Link
              to="/admin/users"
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/10"
              aria-label="Admin"
            >
              <ShieldCheck size={12} /> Admin
            </Link>
          )}
          {profile && (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 rounded-lg border border-muted-foreground/20 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted"
              aria-label="Sign out"
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4 pb-20">
        {showLoadingOverlay ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : showWaitingScreen ? (
          <WaitingScreen
            mobile={profile?.mobile}
            hasPrimaryRole={hasPrimaryRole}
            roles={roles}
          />
        ) : (
          children
        )}
      </main>

      {tabsToRender.length > 0 && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
          <div
            className="mx-auto grid max-w-md"
            style={{ gridTemplateColumns: `repeat(${tabsToRender.length}, minmax(0, 1fr))` }}
          >
            {tabsToRender.map((tab) => {
              const isActive =
                tab.to === "/"
                  ? location.pathname === "/" ||
                    location.pathname === "/receive" ||
                    location.pathname === "/wd-issue" ||
                    location.pathname === "/stock" ||
                    location.pathname === "/movements"
                  : location.pathname.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function WaitingScreen({
  mobile,
  hasPrimaryRole,
  roles,
}: {
  mobile?: string;
  hasPrimaryRole: boolean;
  roles: AppRole[];
}) {
  let title = "Waiting for role and assignment";
  let body = `Your account ${mobile ? `(+91 ${mobile})` : ""} is signed in but no role has been assigned yet. An admin needs to grant you a role (WSP, WD, or TL) before you can use the app.`;

  if (hasPrimaryRole) {
    title = "Waiting for assignment";
    if (roles.includes("wsp")) {
      body = "Your role is set to WSP but no WSP has been assigned to your account. Please contact an admin.";
    } else if (roles.includes("wd")) {
      body = "Your role is set to WD but no WD code has been assigned to your account. Please contact an admin.";
    } else if (roles.includes("tl")) {
      body = "Your role is set to TL but no WD / region has been assigned to your account. Please contact an admin.";
    }
  }

  return (
    <div className="mx-auto max-w-md pt-6">
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
