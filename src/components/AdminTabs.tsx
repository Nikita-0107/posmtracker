import { Link, useLocation } from "@tanstack/react-router";
import { Users, MessageSquareWarning, Network } from "lucide-react";

const TABS = [
  { to: "/admin/users" as const, label: "Users", icon: Users },
  { to: "/admin/hierarchy" as const, label: "Hierarchy", icon: Network },
  { to: "/admin/concerns" as const, label: "Concerns", icon: MessageSquareWarning },
];

export function AdminTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1.5 rounded-xl border bg-card p-1">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
