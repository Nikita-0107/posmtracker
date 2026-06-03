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
  ArrowLeft,
  BookOpen,
} from "lucide-react";
import { WspBadge } from "@/components/WspSelector";
import { NotificationBell } from "@/components/NotificationBell";

import { useAuth } from "@/hooks/use-auth";
import { useRoles, type AppRole } from "@/hooks/use-roles";
import { useIsLossApprover, usePendingApprovalsCount } from "@/hooks/use-loss-approvals";

const tabs = [
  { to: "/" as const, label: "WSP", icon: Building2, roles: ["wsp", "wsp_admin", "admin"] as const },
  { to: "/my-wds" as const, label: "My WDs", icon: Truck, roles: ["wd_admin", "admin"] as const },
  { to: "/tl" as const, label: "TL", icon: Camera, roles: ["tl"] as const },
];

function LossApproverLink() {
  const { isApprover } = useIsLossApprover();
  const { count } = usePendingApprovalsCount(isApprover);
  if (!isApprover) return null;
  return (
    <Link
      to="/loss-approvals"
      className="relative flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
      aria-label="Loss approvals"
    >
      <AlertTriangle size={12} />
      <span className="hidden sm:inline">Approvals</span>
      {count > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[9px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

// Map URL prefixes to the role(s) that can view them.
// IMPORTANT: order matters — more specific prefixes MUST come before shorter ones
// (e.g. "/wd-issue" before "/wd", otherwise "/wd-issue" matches the "/wd" rule).
const routeRoleMap: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/wd-issue-tl", roles: ["wd_admin", "admin"] },
  { prefix: "/wd-issue", roles: ["wsp", "wsp_admin", "admin"] },
  { prefix: "/my-wds", roles: ["wd_admin", "admin"] },
  { prefix: "/wd-admin", roles: ["wd_admin", "admin"] },
  { prefix: "/wd", roles: ["wd_admin", "admin", "tl"] },
  { prefix: "/ae", roles: ["wd_admin", "admin"] },
  { prefix: "/tl", roles: ["tl", "admin"] },
  { prefix: "/receive", roles: ["wsp", "wsp_admin", "admin"] },
  { prefix: "/wsp-issues", roles: ["wsp", "wsp_admin", "admin"] },
  { prefix: "/losses", roles: ["wsp", "wsp_admin", "admin"] },
  { prefix: "/stock", roles: ["wsp", "wsp_admin", "admin"] },
  { prefix: "/movements", roles: ["wsp", "wsp_admin", "admin"] },
];

const PUBLIC_PATHS = ["/login", "/admin"];

function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function landingForRoles(roles: AppRole[]): "/" | "/my-wds" | "/tl" {
  if (roles.includes("admin") || roles.includes("wsp") || roles.includes("wsp_admin")) return "/";
  if (roles.includes("wd_admin")) return "/my-wds";
  if (roles.includes("tl")) return "/tl";
  return "/";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, profile, loading: authLoading, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { roles, aeWds, isAdmin, isWspAdmin, isTl, tlId, aeId, loading: rolesLoading, refresh: refreshRoles } = useRoles();

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

    const match = routeRoleMap.find((r) => matchesRoutePrefix(location.pathname, r.prefix));
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

  // While auth/roles still loading, render a thin shell.
  // Also keep the overlay while a role-based redirect is pending so users
  // don't briefly see the WSP "/" screen before being sent to their landing.
  const onPublicPathEarly = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  let pendingRedirect = false;
  if (!!user && !authLoading && !rolesLoading && !onPublicPathEarly && !isAdmin) {
    if (location.pathname === "/" && !roles.includes("wsp") && !roles.includes("wsp_admin")) {
      if (landingForRoles(roles) !== "/") pendingRedirect = true;
    } else {
      const match = routeRoleMap.find((r) => matchesRoutePrefix(location.pathname, r.prefix));
      if (match && !match.roles.some((r) => roles.includes(r))) pendingRedirect = true;
    }
  }
  const showLoadingOverlay = ((authLoading || rolesLoading) && !!user) || pendingRedirect;

  // Determine if this user has any role-allowed entity assigned at all
  const hasPrimaryRole =
    isAdmin ||
    roles.includes("wsp") || roles.includes("wsp_admin") ||
    roles.includes("wd") || roles.includes("wd_admin") ||
    roles.includes("tl");
  const hasEntity =
    isAdmin ||
    ((roles.includes("wsp") || roles.includes("wsp_admin")) && !!profile?.wsp) ||
    (roles.includes("wd_admin") && (!!aeId || aeWds.length > 0)) ||
    (isTl && !!tlId);

  const showWaitingScreen =
    !!user &&
    !authLoading &&
    !rolesLoading &&
    !PUBLIC_PATHS.some((p) => location.pathname.startsWith(p)) &&
    (!hasPrimaryRole || !hasEntity);

  const homePath = landingForRoles(roles);
  const onPublicPath = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  const showBackHome =
    !!user &&
    !authLoading &&
    !rolesLoading &&
    !onPublicPath &&
    !showWaitingScreen &&
    location.pathname !== homePath;


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-card/95 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex min-w-0 items-center gap-2.5 leading-tight">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
            <span className="text-base">📦</span>
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="font-heading text-[15px] font-bold tracking-tight text-foreground leading-tight">
              POSM Tracker
            </h1>
            {profile?.display_name && (
              <p className="truncate text-[11px] font-medium text-muted-foreground leading-tight">
                Hi {profile.display_name.split(" ")[0]} 👋
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <WspBadge hideForSuperAdmin={location.pathname === "/"} />
          {user && <NotificationBell />}
          
          <LossApproverLink />

          {(isAdmin || isWspAdmin || profile) && (
            <div className="flex flex-col gap-1">
              {(isAdmin || isWspAdmin) && (
                <Link
                  to="/admin/users"
                  className="flex items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/10"
                  aria-label="Admin"
                >
                  <ShieldCheck size={10} /> {isAdmin ? "Admin" : "WSP Admin"}
                </Link>
              )}
              {profile && (
                <Link
                  to="/account"
                  className="flex items-center justify-center rounded-md border border-muted-foreground/20 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted"
                  aria-label="Account"
                >
                  Account
                </Link>
              )}
            </div>
          )}
          {profile && (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 rounded-lg border border-muted-foreground/20 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted"
              aria-label="Sign out"
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      </header>

      {showBackHome && (
        <div className="sticky top-[52px] z-20 border-b bg-card/95 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <Link
            to={homePath}
            aria-label="Back to Home"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/10 active:scale-[0.98]"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
            <span>Back to Home</span>
          </Link>
        </div>
      )}

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

      {!showWaitingScreen && user && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] pb-[env(safe-area-inset-bottom)]">
          <div
            className="mx-auto grid max-w-md"
            style={{ gridTemplateColumns: `repeat(${tabsToRender.length + 1}, minmax(0, 1fr))` }}
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
                  className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors active:scale-[0.97] ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                  )}
                  {tab.to !== "/tl" && <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} />}
                  <span className={tab.to === "/tl" ? "text-sm" : undefined}>{tab.label}</span>
                </Link>
              );
            })}
            {(() => {
              const isActive = location.pathname.startsWith("/posm-guide");
              return (
                <Link
                  to="/posm-guide"
                  className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors active:scale-[0.97] ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="POSM Guide"
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                  )}
                  <BookOpen size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span>Guide</span>
                </Link>
              );
            })()}

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
    "Your account was created successfully and is awaiting admin review. An admin will assign your role (WSP, AE/WD Admin, or TL) and the entity you belong to. You'll get access as soon as that's done — usually within a few hours.";

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
