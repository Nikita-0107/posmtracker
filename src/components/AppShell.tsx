import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, Camera, Inbox, Boxes, Building2, LogOut, ShieldCheck, History } from "lucide-react";
import { WspBadge } from "@/components/WspSelector";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/" as const, label: "WSP", icon: Building2 },
  { to: "/receive" as const, label: "Receive", icon: Inbox },
  { to: "/stock" as const, label: "Stock", icon: Boxes },
  { to: "/wd-issue" as const, label: "WD → TL", icon: Package },
  { to: "/tl-upload" as const, label: "TL Upload", icon: Camera },
  { to: "/movements" as const, label: "Log", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, profile, user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(!!data);
      });
    return () => {
      active = false;
    };
  }, [user]);

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

      <main className="flex-1 overflow-y-auto px-3 py-4 pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto grid max-w-md grid-cols-6">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
