import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Truck, Boxes, Building2, History, AlertTriangle, XOctagon, Send, MessageSquareWarning } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SuperAdminWspSwitcher } from "@/components/SuperAdminWspSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";
import { useOpenIssuesCount } from "@/hooks/use-wsp-issues";
import { useLossesSummary } from "@/hooks/use-losses";

export const Route = createFileRoute("/")({
  component: WspOperationsPage,
  head: () => ({
    meta: [
      { title: "WSP Operations — POSM Tracker" },
      { name: "description", content: "Receive, dispatch and view stock for your WSP." },
    ],
  }),
});

type OpTo =
  | "/receive"
  | "/wd-issue"
  | "/wsp-in-transit"
  | "/stock"
  | "/movements"
  | "/wsp-issues"
  | "/losses"
  | "/concerns";

type Op = {
  to: OpTo;
  label: string;
  desc: string;
  icon: typeof Inbox;
  iconColor: string;
};

const primaryOps: Op[] = [
  { to: "/receive", label: "Receive", desc: "Add incoming stock", icon: Inbox, iconColor: "bg-accent/15 text-accent-foreground" },
  { to: "/wd-issue", label: "Dispatch", desc: "Send to WD", icon: Truck, iconColor: "bg-primary/10 text-primary" },
];

const stockOps: Op[] = [
  { to: "/stock", label: "SOH", desc: "Current levels", icon: Boxes, iconColor: "bg-success/10 text-success" },
  { to: "/wsp-in-transit", label: "In Transit", desc: "Awaiting WD", icon: Send, iconColor: "bg-warning/15 text-warning-foreground" },
  { to: "/movements", label: "Movements", desc: "Recent activity", icon: History, iconColor: "bg-muted text-muted-foreground" },
];

const issueOps: Op[] = [
  { to: "/wsp-issues", label: "Issues from WD", desc: "Resolve disputes", icon: AlertTriangle, iconColor: "bg-destructive/15 text-destructive" },
  { to: "/losses", label: "Losses", desc: "Written-off stock", icon: XOctagon, iconColor: "bg-destructive/10 text-destructive" },
  { to: "/concerns", label: "Concerns to HO", desc: "Report issues", icon: MessageSquareWarning, iconColor: "bg-warning/15 text-warning-foreground" },
];

function WspOperationsPage() {
  const { loading: authLoading, rolesLoading, user } = useAuth();
  const { roles, isAdmin } = useRoles();

  // Only mount WSP queries/content for users actually authorized to view this page.
  // AppShell will render its spinner overlay while loading and redirect non-WSP users.
  const canViewWsp =
    !!user &&
    !authLoading &&
    !rolesLoading &&
    (isAdmin || roles.includes("wsp") || roles.includes("wsp_admin"));

  return (
    <AppShell>
      {canViewWsp ? <WspOperationsContent /> : null}
    </AppShell>
  );
}

function WspOperationsContent() {
  const { wsp, isSuperAdmin } = useEffectiveWsp();
  const { count: openIssuesCount } = useOpenIssuesCount();
  const { totalQty: lossQty, count: lossCount } = useLossesSummary();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Building2 size={18} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold leading-tight">WSP Operations</h2>
            {!isSuperAdmin && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                {wsp ? (
                  <><strong className="text-primary">{wsp}</strong></>
                ) : "No WSP assigned"}
              </p>
            )}
          </div>
        </div>

        {isSuperAdmin && <SuperAdminWspSwitcher />}

        {/* Primary daily actions — large, thumb-friendly */}
        <section className="grid grid-cols-2 gap-3">
          {primaryOps.map((op) => (
            <Link
              key={op.to}
              to={op.to}
              className="group relative flex flex-col gap-2 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-card p-3.5 shadow-sm transition active:scale-[0.98]"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${op.iconColor}`}>
                <op.icon size={20} />
              </div>
              <p className="text-sm font-bold leading-tight text-foreground">{op.label}</p>
            </Link>
          ))}
        </section>

        <CompactGroup title="Stock" ops={stockOps} />

        <CompactGroup
          title="Issues"
          ops={issueOps}
          badge={(to) => {
            if (to === "/wsp-issues" && openIssuesCount > 0) {
              return (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                  {openIssuesCount > 99 ? "99+" : openIssuesCount}
                </span>
              );
            }
            if (to === "/losses" && lossQty > 0) {
              return (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                  −{lossQty > 999 ? "999+" : lossQty}
                </span>
              );
            }
            return null;
          }}
          subDesc={(to, op) =>
            to === "/losses" && lossCount > 0
              ? `${lossQty} units · ${lossCount} ${lossCount === 1 ? "event" : "events"}`
              : op.desc
          }
        />
      </div>
  );
}

function CompactGroup({
  title,
  ops,
  badge,
  subDesc,
}: {
  title: string;
  ops: Op[];
  badge?: (to: OpTo) => React.ReactNode;
  subDesc?: (to: OpTo, op: Op) => string;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl border bg-card divide-y">
        {ops.map((op) => (
          <Link
            key={op.to}
            to={op.to}
            className="flex items-center gap-3 px-3 py-3 transition active:bg-muted/60"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${op.iconColor}`}>
              <op.icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">{op.label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {subDesc ? subDesc(op.to, op) : op.desc}
              </p>
            </div>
            {badge?.(op.to)}
            <span className="text-muted-foreground/50">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
