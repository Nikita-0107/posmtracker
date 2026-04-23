import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Truck,
  Camera,
  LogOut,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Clock,
  RefreshCw,
} from "lucide-react";
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
  { prefix: "/wsp-issues", roles: ["wsp", "admin"] },
  { prefix: "/losses", roles: ["wsp", "admin"] },
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
  const { signOut, profile, loading: authLoading, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { roles, isAdmin, loading: rolesLoading, refresh: refreshRoles } = useRoles();

  // Filter tabs by roles
  const visibleTabs = tabs.filter((t) => t.roles.some((r) => roles.includes(r)));
  const tabsToRender = visibleTabs.length > 0 ? visibleTabs : [];

  // Redirect away from a tab the user can't access (and from "/" for non-WSP roles)
  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) return;
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) return;
    if (isAdmin) return;

    // "/" is the WSP landing — redirect WD/TL users to their own landing
    if (location.pathname === "/") {
      if (!roles.includes("wsp")) {
        const dest = landingForRoles(roles);
        if (dest !== "/") navigate({ to: dest, replace: true });
      }
      return;
    }

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
            displayName={profile?.display_name}
            hasPrimaryRole={hasPrimaryRole}
            roles={roles}
            onRefresh={async () => {
              await Promise.all([refreshProfile?.(), refreshRoles()]);
            }}
            onSignOut={handleSignOut}
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
                    location.pathname === "/wsp-issues" ||
                    location.pathname === "/losses" ||
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
  displayName,
  hasPrimaryRole,
  roles,
  onRefresh,
  onSignOut,
}: {
  mobile?: string;
  displayName?: string | null;
  hasPrimaryRole: boolean;
  roles: AppRole[];
  onRefresh: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  // Pending = brand new signup with no role yet. Other states = role exists
  // but the entity (WSP / WD code) hasn't been linked.
  const pending = !hasPrimaryRole;

  let title = "Account pending approval";
  let body =
    "Your account was created successfully and is awaiting admin review. An admin will assign your role (WSP, WD, or TL) and the entity you belong to. You'll get access as soon as that's done — usually within a few hours.";

  if (!pending) {
    if (roles.includes("wsp")) {
      title = "Waiting for WSP assignment";
      body =
        "Your role is set to WSP but no WSP has been assigned to your account. Please contact an admin.";
    } else if (roles.includes("wd")) {
      title = "Waiting for WD assignment";
      body =
        "Your role is set to WD but no WD code has been assigned to your account. Please contact an admin.";
    } else if (roles.includes("tl")) {
      title = "Waiting for assignment";
      body =
        "Your role is set to TL but no WD / region has been assigned to your account. Please contact an admin.";
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const Icon = pending ? Clock : AlertTriangle;
  const accent = pending
    ? {
        wrap: "border-primary/30 bg-primary/5",
        iconWrap: "bg-primary/10 text-primary",
      }
    : {
        wrap: "border-destructive/30 bg-destructive/5",
        iconWrap: "bg-destructive/10 text-destructive",
      };

  return (
    <div className="mx-auto max-w-md pt-8">
      <div className={`rounded-2xl border-2 p-5 shadow-sm ${accent.wrap}`}>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.iconWrap}`}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
            {displayName && (
              <p className="text-xs font-semibold text-foreground">Hi {displayName},</p>
            )}
            <p className="text-[12px] leading-relaxed text-muted-foreground">{body}</p>

            {mobile && (
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Your account
                </p>
                <p className="font-mono text-sm font-bold text-foreground">+91 {mobile}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Checking…" : "Refresh status"}
              </button>
              <button
                type="button"
                onClick={() => onSignOut()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-muted-foreground/20 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>

            <p className="pt-1 text-[10px] text-muted-foreground">
              Need help? Contact your admin and share the mobile number above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
