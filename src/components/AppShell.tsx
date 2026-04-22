import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Building2, Truck, Camera, LogOut, ShieldCheck } from "lucide-react";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";

const tabs = [
  { to: "/" as const, label: "WSP", icon: Building2, roles: ["wsp", "admin"] as const },
  { to: "/wd" as const, label: "WD", icon: Truck, roles: ["wd", "admin"] as const },
  { to: "/tl" as const, label: "TL", icon: Camera, roles: ["tl", "admin"] as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const { roles, isAdmin } = useRoles();

  const visibleTabs = tabs.filter((t) =>
    t.roles.some((r) => roles.includes(r)),
  );
  // Fallback: if user has no roles yet, show all so they aren't stuck on a blank shell
  const tabsToRender = visibleTabs.length > 0 ? visibleTabs : tabs;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

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

      <main className="flex-1 overflow-y-auto px-3 py-4 pb-20">{children}</main>

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
    </div>
  );
}
