import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Lock, ArrowRight, AlertTriangle, ShieldCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — POSM Tracker" },
      { name: "description", content: "Sign in or create an account with your mobile number." },
    ],
  }),
});

function LoginPage() {
  const { isAuthenticated, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate({ to: "/" });
  }, [isAuthenticated, loading, navigate]);

  const isValidId = loginId.trim().length >= 3;
  const isValidPassword = password.length >= 6;
  const canSubmit = isValidId && isValidPassword && (mode === "signin" || displayName.trim().length > 0);

  function handleIdChange(value: string) {
    setLoginId(value.replace(/\s/g, ""));
    if (error) setError(null);
  }

  async function handleSubmit() {
    if (!isValidId) {
      setError("Enter your ID (mobile / AE ID / TL ID)");
      return;
    }
    if (!isValidPassword) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError(null);
    setInfo(null);
    setBusy(true);

    if (mode === "signin") {
      const { error: signInError } = await signIn(loginId, password);
      setBusy(false);
      if (signInError) {
        setError(signInError.message.includes("Invalid login")
          ? "Invalid ID or password"
          : signInError.message);
        return;
      }
      navigate({ to: "/" });
    } else {
      const { error: signUpError } = await signUp(loginId, password, displayName.trim());
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setInfo("Account created! Sign in to continue. An admin will review and assign your role shortly.");
      setMode("signin");
      setPassword("");
    }
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck size={28} className="text-primary" />
            </div>
            <h1 className="mt-3 font-heading text-xl font-bold text-foreground">📦 POSM Tracker</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "signin" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl border bg-card p-1">
            <button
              onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                mode === "signin" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                mode === "signup" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <motion.section
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm"
          >
            {mode === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-foreground">Your Name</span>
                <div className="relative">
                  <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Full name"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">ID</span>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(e) => handleIdChange(e.target.value)}
                  placeholder="Enter ID"
                  className={`${inputClass} pl-9 font-mono tracking-wider`}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Password</span>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  placeholder="At least 6 characters"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </label>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive"
                >
                  <AlertTriangle size={14} /> {error}
                </motion.div>
              )}
              {info && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg bg-success/10 px-2.5 py-2 text-[11px] font-semibold text-success"
                >
                  {info}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
              {!busy && <ArrowRight size={16} />}
            </button>

            {mode === "signup" && (
              <p className="text-center text-[10px] text-muted-foreground">
                After signup, an admin will review and assign your role (WSP, WD, or TL). You can sign in immediately to check your status.
              </p>
            )}
          </motion.section>

          <p className="text-center text-[10px] text-muted-foreground">
            <Link to="/" className="text-primary underline-offset-2 hover:underline">Back to home</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
