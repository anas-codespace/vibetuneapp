import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password · Vibtune" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
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
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/app" });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <Link to="/" className="absolute left-6 top-6"><VibtuneLogo className="h-9" /></Link>
      <motion.form
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        onSubmit={handleSubmit}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <h1 className="mb-2 text-3xl font-bold">Set a new <span className="vibe-text">password</span></h1>
        <p className="mb-6 text-sm text-white/60">
          {ready
            ? "Choose something you'll remember. You'll be signed in right after."
            : "Open this page from the reset email link. Waiting for the secure session…"}
        </p>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">New password</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" required disabled={!ready}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-pink-500/60 disabled:opacity-50"
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
            autoComplete="new-password" required disabled={!ready}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60 disabled:opacity-50"
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

        <button type="submit" disabled={loading || !ready}
          className="vibe-gradient-h mt-2 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Saving…" : "Update password"}
        </button>

        <p className="mt-6 text-center text-sm text-white/60">
          <Link to="/login" className="text-white underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </motion.form>
    </main>
  );
}
