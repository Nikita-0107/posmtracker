import { Link, useLocation } from "@tanstack/react-router";
import { Package, Camera, Inbox, Boxes, Building2 } from "lucide-react";
import { WspSelector } from "@/components/WspSelector";

const tabs = [
  { to: "/" as const, label: "WSP", icon: Building2 },
  { to: "/receive" as const, label: "Receive", icon: Inbox },
  { to: "/stock" as const, label: "Stock", icon: Boxes },
  { to: "/wd-issue" as const, label: "WD → TL", icon: Package },
  { to: "/tl-upload" as const, label: "TL Upload", icon: Camera },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card px-3 py-2 shadow-sm">
        <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
          📦 POSM Tracker
        </h1>
        <WspSelector compact />
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4 pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto grid max-w-md grid-cols-5">
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
