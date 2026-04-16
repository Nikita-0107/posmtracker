import { Link, useLocation } from "@tanstack/react-router";
import { Package, Truck, Camera } from "lucide-react";

const tabs = [
  { to: "/" as const, label: "Dispatch", icon: Truck },
  { to: "/wd-issue" as const, label: "WD Issue", icon: Package },
  { to: "/tl-upload" as const, label: "TL Upload", icon: Camera },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card px-4 py-3 shadow-sm">
        <h1 className="text-center font-heading text-lg font-bold tracking-tight text-foreground">
          📦 POSM Tracker
        </h1>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-md">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
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
