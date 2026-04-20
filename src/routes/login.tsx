import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, KeyRound, ArrowRight, AlertTriangle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — POSM Tracker" },
      { name: "description", content: "Sign in with your mobile number and OTP." },
    ],
  }),
});

const FIXED_OTP = "1234";

function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [mobile, setMobile] = useState("");
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate({ to: "/" });
  }, [isAuthenticated, navigate]);

  const isValidMobile = /^\d{10}$/.test(mobile);

  function handleMobileChange(value: string) {
    // Strip non-digits and cap at 10
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    setMobile(cleaned);
    if (mobileError) setMobileError(null);
  }

  function handleSendOtp() {
    if (!isValidMobile) {
      setMobileError("Enter a valid 10-digit mobile number");
      return;
    }
    setMobileError(null);
    setOtp("");
    setOtpError(null);
    setStep("otp");
  }

  function handleVerifyOtp() {
    if (otp !== FIXED_OTP) {
      setOtpError("Invalid OTP");
      return;
    }
    setOtpError(null);
    signIn(mobile);
    navigate({ to: "/" });
  }

  const inputClass =
    "w-full rounded-xl border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Brand */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck size={28} className="text-primary" />
            </div>
            <h1 className="mt-3 font-heading text-xl font-bold text-foreground">
              📦 POSM Tracker
            </h1>
            <p className="text-xs text-muted-foreground">Sign in to continue</p>
          </div>

          <AnimatePresence mode="wait">
            {step === "mobile" ? (
              <motion.section
                key="mobile"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm"
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Mobile Number</span>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={mobile}
                      onChange={(e) => handleMobileChange(e.target.value)}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className={`${inputClass} pl-16 font-mono tracking-wider ${
                        mobileError ? "border-destructive ring-2 ring-destructive/20" : ""
                      }`}
                    />
                  </div>
                </label>

                {mobileError && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                    <AlertTriangle size={14} /> {mobileError}
                  </div>
                )}

                <button
                  onClick={handleSendOtp}
                  disabled={!isValidMobile}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                >
                  Send OTP <ArrowRight size={16} />
                </button>
              </motion.section>
            ) : (
              <motion.section
                key="otp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Enter OTP</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sent to <strong className="font-mono text-foreground">+91 {mobile}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setStep("mobile");
                      setOtp("");
                      setOtpError(null);
                    }}
                    className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Change
                  </button>
                </div>

                <label className="block space-y-1.5">
                  <div className="relative">
                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, "").slice(0, 4));
                        if (otpError) setOtpError(null);
                      }}
                      placeholder="4-digit OTP"
                      maxLength={4}
                      className={`${inputClass} pl-9 font-mono tracking-[0.5em] ${
                        otpError ? "border-destructive ring-2 ring-destructive/20" : ""
                      }`}
                    />
                  </div>
                </label>

                {otpError && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
                    <AlertTriangle size={14} /> {otpError}
                  </div>
                )}

                <button
                  onClick={handleVerifyOtp}
                  disabled={otp.length !== 4}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40"
                >
                  Verify & Continue
                </button>

                <p className="text-center text-[10px] text-muted-foreground">
                  For demo, use OTP <strong className="font-mono text-foreground">1234</strong>
                </p>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
