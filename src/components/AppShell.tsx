import { Link, useLocation } from "@tanstack/react-router";
import { Package, Truck, Camera, Inbox, Boxes } from "lucide-react";

const tabs = [
  { to: "/receive" as const, label: "Receive", icon: Inbox },
  { to: "/stock" as const, label: "Stock", icon: Boxes },
  { to: "/" as const, label: "Dispatch", icon: Truck },
  { to: "/wd-issue" as const, label: "WD → TL", icon: Package },
  { to: "/tl-upload" as const, label: "TL Upload", icon: Camera },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card px-4 py-2.5 shadow-sm">
        <h1 className="text-center font-heading text-base font-bold tracking-tight text-foreground">
          📦 POSM Tracker
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4 pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto grid max-w-md grid-cols-4">
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
