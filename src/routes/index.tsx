import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Truck, Boxes, ChevronRight, Building2, History, AlertTriangle, XOctagon } from "lucide-react";
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

const operations = [
  {
    to: "/receive" as const,
    label: "Receive Materials",
    desc: "Add stock into your WSP",
    icon: Inbox,
    color: "bg-accent/10 text-accent",
  },
  {
    to: "/wd-issue" as const,
    label: "Dispatch to WD",
    desc: "Send POSM to distributors",
    icon: Truck,
    color: "bg-primary/10 text-primary",
  },
  {
    to: "/stock" as const,
    label: "View Stock",
    desc: "Current WSP stock levels",
    icon: Boxes,
    color: "bg-success/10 text-success",
  },
  {
    to: "/movements" as const,
    label: "Movement Log",
    desc: "Recent receives & dispatches",
    icon: History,
    color: "bg-muted text-muted-foreground",
  },
  {
    to: "/wsp-issues" as const,
    label: "Issues Raised by WD",
    desc: "Resolve dispatch issues from distributors",
    icon: AlertTriangle,
    color: "bg-destructive/10 text-destructive",
  },
  {
    to: "/losses" as const,
    label: "Losses",
    desc: "Stock written off from accepted issues",
    icon: XOctagon,
    color: "bg-destructive/10 text-destructive",
  },
];

function WspOperationsPage() {
  const { profile } = useAuth();
  const { count: openIssuesCount } = useOpenIssuesCount();
  const { totalQty: lossQty, count: lossCount } = useLossesSummary();
  const wsp = profile?.wsp;

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
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
          <div className="space-y-2">
            {operations.map((op) => (
              <Link
                key={op.label}
                to={op.to}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition active:scale-[0.99] hover:border-primary/40"
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${op.color}`}>
                  <op.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{op.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {op.to === "/losses" && lossCount > 0
                      ? `${lossQty} units across ${lossCount} ${lossCount === 1 ? "event" : "events"}`
                      : op.desc}
                  </p>
                </div>
                {op.to === "/wsp-issues" && openIssuesCount > 0 ? (
                  <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">
                    {openIssuesCount > 99 ? "99+" : openIssuesCount}
                  </span>
                ) : null}
                {op.to === "/losses" && lossQty > 0 ? (
                  <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive">
                    −{lossQty > 999 ? "999+" : lossQty}
                  </span>
                ) : null}
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
