import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/tl")({
  component: TlHomePage,
  head: () => ({
    meta: [
      { title: "TL — POSM Tracker" },
      { name: "description", content: "Team Leader operations: upload POSM placement proof." },
    ],
  }),
});

function TlHomePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Camera size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight">TL Operations</h2>
            <p className="text-[11px] text-muted-foreground">
              Upload placement proof from the field
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-foreground">Choose an operation</h3>
          <Link
            to="/tl-upload"
            className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition active:scale-[0.99] hover:border-primary/40"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Camera size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">TL Upload</p>
              <p className="text-[11px] text-muted-foreground">Upload POSM placement photo</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
