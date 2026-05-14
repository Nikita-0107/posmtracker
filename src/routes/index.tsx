import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Truck, Boxes, Building2, History, AlertTriangle, XOctagon, Send, MessageSquareWarning } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SuperAdminWspSwitcher } from "@/components/SuperAdminWspSwitcher";
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
  const { wsp, isSuperAdmin } = useEffectiveWsp();
  const { count: openIssuesCount } = useOpenIssuesCount();
  const { totalQty: lossQty, count: lossCount } = useLossesSummary();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">WSP Operations</h2>
            <p className="text-[11px] text-muted-foreground">
              {wsp ? (
                <>
                  Active WSP: <strong className="text-primary">{wsp}</strong>
                  {isSuperAdmin && <span className="ml-1 text-muted-foreground">(viewing)</span>}
                </>
              ) : (
                "No WSP assigned"
              )}
            </p>
          </div>
        </div>

        {isSuperAdmin && <SuperAdminWspSwitcher />}

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-foreground">Choose an operation</h3>
          <div className="grid grid-cols-2 gap-3">
            {operations.map((op) => {
              const showIssueBadge = op.to === "/wsp-issues" && openIssuesCount > 0;
              const showLossBadge = op.to === "/losses" && lossQty > 0;
              return (
                <Link
                  key={op.label}
                  to={op.to}
                  className={`relative flex min-h-[120px] flex-col items-start gap-2 rounded-2xl border p-4 transition active:scale-[0.98] ${toneClasses[op.tone]}`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${op.iconColor}`}>
                    <op.icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight text-foreground">{op.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {op.to === "/losses" && lossCount > 0
                        ? `${lossQty} units · ${lossCount} ${lossCount === 1 ? "event" : "events"}`
                        : op.desc}
                    </p>
                  </div>
                  {showIssueBadge ? (
                    <span className="absolute right-3 top-3 inline-flex min-w-7 items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                      {openIssuesCount > 99 ? "99+" : openIssuesCount}
                    </span>
                  ) : null}
                  {showLossBadge ? (
                    <span className="absolute right-3 top-3 inline-flex min-w-7 items-center justify-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                      −{lossQty > 999 ? "999+" : lossQty}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
