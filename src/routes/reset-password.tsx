import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Eye, EyeOff, Check, X, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password · Vibtune" }] }),
  component: ResetPasswordPage,
});

type Status = "verifying" | "ready" | "invalid" | "success";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [linkError, setLinkError] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  // Verify the recovery token from the email link
  useEffect(() => {
    let settled = false;
    const settle = (s: Status, msg = "") => {
      if (settled) return;
      settled = true;
      setStatus(s);
      if (msg) setLinkError(msg);
    };

    // 1. Check the URL hash for an explicit error from Supabase (expired/used link)
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const err = params.get("error_description") || params.get("error");
      if (err) {
        settle("invalid", decodeURIComponent(err.replace(/\+/g, " ")));
        return;
      }
    }

    // 2. Listen for PASSWORD_RECOVERY (Supabase parses the hash on mount)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") settle("ready");
    });

    // 3. Fallback: if a session already exists, we're good
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle("ready");
    });

    // 4. Give Supabase a moment; if nothing arrives, the link is invalid
    const timer = setTimeout(() => {
      settle("invalid", "This reset link is invalid or has expired. Please request a new one.");
    }, 4000);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", ok: /\d/.test(password) },
    { label: "Passwords match", ok: password.length > 0 && password === confirm },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rules.some((r) => !r.ok)) {
      toast.error("Please meet all password requirements.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStatus("success");
    toast.success("Password updated successfully.");
    setTimeout(() => navigate({ to: "/app" }), 1600);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <Link to="/" className="absolute left-6 top-6"><VibtuneLogo className="h-9" /></Link>

      {status === "verifying" && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-strong w-full max-w-md rounded-3xl p-8 text-center"
        >
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-pink-400" />
          <h1 className="mb-2 text-2xl font-bold">Verifying your link…</h1>
          <p className="text-sm text-white/60">Confirming the secure recovery token from your email.</p>
        </motion.div>
      )}

      {status === "invalid" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-strong w-full max-w-md rounded-3xl p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
            <ShieldAlert className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Link invalid or expired</h1>
          <p className="mb-6 text-sm text-white/60">
            {linkError || "This password reset link can't be used. Reset links expire after a short time and can only be used once."}
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/forgot-password" className="vibe-gradient-h w-full rounded-full py-3 font-semibold text-white">
              Request a new link
            </Link>
            <Link to="/login" className="text-sm text-white/70 hover:text-white">Back to sign in</Link>
          </div>
        </motion.div>
      )}

      {status === "success" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="glass-strong w-full max-w-md rounded-3xl p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Password updated</h1>
          <p className="mb-6 text-sm text-white/60">You're signed in. Redirecting you to Vibtune…</p>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/60" />
        </motion.div>
      )}

      {status === "ready" && (
        <motion.form
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          onSubmit={handleSubmit}
          className="glass-strong w-full max-w-md rounded-3xl p-8"
        >
          <h1 className="mb-2 text-3xl font-bold">Set a new <span className="vibe-text">password</span></h1>
          <p className="mb-6 text-sm text-white/60">
            Choose something you'll remember. You'll be signed in right after.
          </p>

          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">New password</span>
            <div className="relative">
              <input
                type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-pink-500/60"
              />
              <button type="button" onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-3 flex items-center text-white/60 hover:text-white">
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Confirm password</span>
            <input
              type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60"
            />
          </label>

          <ul className="mb-4 space-y-1 text-xs text-white/60">
            {rules.map((r) => (
              <li key={r.label} className="flex items-center gap-2">
                {r.ok ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-white/40" />}
                <span className={r.ok ? "text-white/80" : ""}>{r.label}</span>
              </li>
            ))}
          </ul>

          <button type="submit" disabled={loading}
            className="vibe-gradient-h mt-2 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60">
            {loading ? "Saving…" : "Update password"}
          </button>

          <p className="mt-6 text-center text-sm text-white/60">
            <Link to="/login" className="text-white underline-offset-4 hover:underline">Back to sign in</Link>
          </p>
        </motion.form>
      )}
    </main>
  );
}
