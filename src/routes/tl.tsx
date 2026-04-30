import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/tl")({
  component: TlHomePage,
  head: () => ({
    meta: [
      { title: "TL — POSM Tracker" },
      { name: "description", content: "TLs do not need to use the system." },
    ],
  }),
});

function TlHomePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 size={20} />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-base font-bold text-foreground">
                No app actions needed
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                POSM tracking now works on a weekly cycle. Your WD allocates POSM to you
                once a week and reconciles physical stock when you return what's left at
                the end of the week.
              </p>
              <div className="flex items-start gap-2 rounded-lg border bg-card p-2.5">
                <Info size={14} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-[11px] text-foreground">
                  Continue uploading outlet placement photos in the existing app you
                  already use. Nothing else is required here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
