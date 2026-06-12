import { Link, useLocation } from "@tanstack/react-router";
import { Users, MessageSquareWarning, Network, FileSpreadsheet, Database, Package, Image as ImageIcon, ChartNoAxesCombined } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";

const ALL_TABS = [
  { to: "/admin/users" as const, label: "Users", icon: Users, superOnly: false },
  { to: "/admin/hierarchy" as const, label: "Import", icon: Network, superOnly: true },
  { to: "/admin/wd-stock" as const, label: "WD Stock", icon: Package, superOnly: true },
  { to: "/admin/master" as const, label: "Master Data", icon: Database, superOnly: true },
  { to: "/admin/material-images" as const, label: "Images", icon: ImageIcon, superOnly: true },
  { to: "/admin/bulk-dispatch-tracker" as const, label: "Tracker", icon: ChartNoAxesCombined, superOnly: true },
  { to: "/admin/concerns" as const, label: "Concerns", icon: MessageSquareWarning, superOnly: false },
  { to: "/admin/bulk-dispatch" as const, label: "Bulk Dispatch", icon: FileSpreadsheet, superOnly: false },
];

export function AdminTabs() {
  const { pathname } = useLocation();
  const { isSuperAdmin } = useRoles();
  const tabs = ALL_TABS.filter((t) => isSuperAdmin || !t.superOnly);
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex flex-1 min-w-[88px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
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
