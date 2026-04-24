import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Truck, Boxes, ChevronRight, Building2, History, AlertTriangle, XOctagon, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
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

type Tone = "neutral" | "warning" | "danger";

const operations: Array<{
  to: "/receive" | "/wd-issue" | "/wsp-in-transit" | "/stock" | "/movements" | "/wsp-issues" | "/losses";
  label: string;
  desc: string;
  icon: typeof Inbox;
  iconColor: string;
  tone: Tone;
}> = [
  {
    to: "/receive",
    label: "Receive Materials",
    desc: "Add stock",
    icon: Inbox,
    iconColor: "bg-accent/10 text-accent",
    tone: "neutral",
  },
  {
    to: "/wd-issue",
    label: "Dispatch to WD",
    desc: "Send POSM",
    icon: Truck,
    iconColor: "bg-primary/10 text-primary",
    tone: "neutral",
  },
  {
    to: "/wsp-in-transit",
    label: "In Transit to WD",
    desc: "Awaiting WD confirmation",
    icon: Send,
    iconColor: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    tone: "warning",
  },
  {
    to: "/stock",
    label: "View Stock",
    desc: "Current levels",
    icon: Boxes,
    iconColor: "bg-success/10 text-success",
    tone: "neutral",
  },
  {
    to: "/movements",
    label: "Movement Log",
    desc: "Recent activity",
    icon: History,
    iconColor: "bg-muted text-muted-foreground",
    tone: "neutral",
  },
  {
    to: "/wsp-issues",
    label: "Issues from WD",
    desc: "Resolve disputes",
    icon: AlertTriangle,
    iconColor: "bg-destructive/15 text-destructive",
    tone: "danger",
  },
  {
    to: "/losses",
    label: "Losses",
    desc: "Written-off stock",
    icon: XOctagon,
    iconColor: "bg-destructive/10 text-destructive",
    tone: "neutral",
  },
];

const toneClasses: Record<Tone, string> = {
  neutral: "bg-card hover:border-primary/40",
  warning:
    "bg-amber-50 border-amber-200 hover:border-amber-400 dark:bg-amber-950/30 dark:border-amber-900/60",
  danger:
    "bg-red-50 border-red-200 hover:border-red-400 dark:bg-red-950/30 dark:border-red-900/60",
};

function WspOperationsPage() {
  const { profile } = useAuth();
  const { count: openIssuesCount } = useOpenIssuesCount();
  const { totalQty: lossQty, count: lossCount } = useLossesSummary();
  const wsp = profile?.wsp;

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
              {wsp ? <>Active WSP: <strong className="text-primary">{wsp}</strong></> : "No WSP assigned"}
            </p>
          </div>
        </div>

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
