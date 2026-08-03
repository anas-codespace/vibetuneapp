import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password · Vibtune" },
      { name: "description", content: "Reset your Vibtune password. Enter your email and we'll send a secure link to get you back into your account." },
      { property: "og:title", content: "Forgot password · Vibtune" },
      { property: "og:description", content: "Get a secure reset link to regain access to your Vibtune account." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/forgot-password" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/forgot-password" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Reset link sent — check your inbox.");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <Link to="/" className="absolute left-6 top-6"><VibtuneLogo className="h-9" /></Link>
      <motion.form
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        onSubmit={handleSubmit}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <h1 className="mb-2 text-3xl font-bold">Reset your <span className="vibe-text">password</span></h1>
        <p className="mb-6 text-sm text-white/60">
          Enter the email you use with Vibtune. We'll send you a link to set a new password.
        </p>

        {sent ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            If an account exists for <span className="font-semibold text-white">{email}</span>, a reset link is on its way. It may take a minute — check your spam folder too.
          </div>
        ) : (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-300/60" />
          </label>
        )}

        {!sent && (
          <button type="submit" disabled={loading}
            className="vibe-gradient-h mt-4 w-full rounded-full py-3.5 font-semibold text-[#050b14] disabled:opacity-60">
            {loading ? "Sending…" : "Send reset link"}
          </button>
        )}

        <p className="mt-6 text-center text-sm text-white/60">
          Remembered it? <Link to="/login" className="text-white underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </motion.form>
    </main>
  );
}
