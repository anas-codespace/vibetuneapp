import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in · Vibtune" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter both your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      if (/email/i.test(error.message) && /confirm/i.test(error.message)) {
        toast.error("Please verify your email first.");
        navigate({ to: "/verify", search: { email } });
        return;
      }
      if (/invalid/i.test(error.message)) {
        toast.error("Email or password is incorrect.");
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back.");
    navigate({ to: "/app" });
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast.error(result.error.message ?? "Google sign-in failed.");
      return;
    }
    if (result.redirected) return;
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
        <p className="mb-6 text-sm text-white/60">
          Sign in with Google, or use the email and password you signed up with.
        </p>

        <button
          type="button" onClick={handleGoogle} disabled={googleLoading || loading}
          className="mb-3 flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/95 py-3 font-semibold text-slate-900 transition hover:bg-white disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "Opening Google…" : "Continue with Google"}
        </button>

        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem("post_login_action", "connect_spotify");
            navigate({ to: "/settings/spotify" });
          }}
          disabled={googleLoading || loading}
          className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 py-3 font-medium text-white transition-all hover:bg-white/10 hover:scale-[1.02] disabled:opacity-60"
        >
          <SpotifyIcon />
          Continue with Spotify
        </button>

        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wider text-white/40">
          <span className="h-px flex-1 bg-white/10" /> or email <span className="h-px flex-1 bg-white/10" />
        </div>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60" />
        </label>
        <label className="mb-2 block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"} required value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              placeholder="Your password"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-pink-500/60"
            />
            <button
              type="button" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-3 flex items-center text-white/60 hover:text-white"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </label>

        <div className="mb-4 flex justify-end">
          <Link to="/forgot-password" className="text-xs text-white/70 underline-offset-4 hover:text-white hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading || googleLoading}
          className="vibe-gradient-h mt-2 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-6 text-center text-sm text-white/60">
          New here? <Link to="/signup" className="text-white underline-offset-4 hover:underline">Create an account</Link>
        </p>
      </motion.form>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/>
      <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"/>
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/>
    </svg>
  );
}
