import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in · Vibtune" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (/email/i.test(error.message) && /confirm/i.test(error.message)) {
        toast.error("Please verify your email first.");
        navigate({ to: "/verify", search: { email } });
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back.");
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
        <h1 className="mb-2 text-3xl font-bold">Welcome <span className="vibe-text">back</span></h1>
        <p className="mb-8 text-sm text-white/60">Pick up where the vibe left off.</p>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60" />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60" />
        </label>

        <button type="submit" disabled={loading}
          className="vibe-gradient-h mt-4 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-6 text-center text-sm text-white/60">
          New here? <Link to="/signup" className="text-white underline-offset-4 hover:underline">Create an account</Link>
        </p>
      </motion.form>
    </main>
  );
}
