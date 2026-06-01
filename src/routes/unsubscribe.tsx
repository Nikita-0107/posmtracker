import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "done" };

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  component: UnsubscribePage,
  head: () => ({ meta: [{ title: "Unsubscribe — POSM Tracker" }] }),
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Missing token." });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/email/unsubscribe?token=${encodeURIComponent(token)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: "invalid", message: data.error ?? "Invalid link" });
          return;
        }
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        setState({ kind: "valid" });
      } catch (e) {
        setState({ kind: "invalid", message: (e as Error).message });
      }
    })();
  }, [token]);

  async function confirm() {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success || data.reason === "already_unsubscribed") {
        setState({ kind: "done" });
      } else {
        setState({
          kind: "invalid",
          message: data.error ?? "Could not unsubscribe",
        });
      }
    } catch (e) {
      setState({ kind: "invalid", message: (e as Error).message });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold">Email preferences</h1>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={14} /> Checking your link…
          </div>
        )}

        {state.kind === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">
              Unsubscribe this address from POSM Tracker emails?
            </p>
            <button
              onClick={confirm}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Confirm unsubscribe
            </button>
          </>
        )}

        {state.kind === "submitting" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={14} /> Updating…
          </div>
        )}

        {state.kind === "done" && (
          <div className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 text-green-600" size={16} />
            <span>You've been unsubscribed. You won't receive these emails anymore.</span>
          </div>
        )}

        {state.kind === "already" && (
          <div className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 text-green-600" size={16} />
            <span>This address is already unsubscribed.</span>
          </div>
        )}

        {state.kind === "invalid" && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5" size={16} />
            <span>{state.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
