import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { VibtuneLogo } from "@/components/VibtuneLogo";

function isSafeNext(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    isSafeNext(s.next) ? { next: s.next } : {},
  head: () => ({
    meta: [
      { title: "Sign up · Vibtune" },
      { name: "description", content: "Create a free Vibtune account to unlock smart mixes, mood-aware playlists, and cross-device sync in seconds." },
      { property: "og:title", content: "Sign up · Vibtune" },
      { property: "og:description", content: "Create your Vibtune account and start vibing in seconds." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/signup" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/signup" }],
  }),
  component: SignupPage,
});

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function SignupPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { status } = useAuth();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (status !== "authenticated") return;
    if (next) window.location.replace(next);
    else navigate({ to: "/app", replace: true });
  }, [status, navigate, next]);

  const rules = [
    { label: "At least 8 characters", ok: form.password.length >= 8 },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(form.password) },
    { label: "Contains a number", ok: /\d/.test(form.password) },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = SignupSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.name },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome to Vibtune — your account is ready.");
    navigate({ to: "/onboarding" });
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    if (next && typeof window !== "undefined") {
      sessionStorage.setItem("post_login_next", next);
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/login",
    });
    if (result.error) {
      setGoogleLoading(false);
      toast.error(result.error.message ?? "Google sign-in failed.");
      return;
    }
    if (result.redirected) return;
    // Session set by helper; the `status === "authenticated"` effect will navigate.
  }

  return (
    <main className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-4">
      <motion.form
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        onSubmit={handleSubmit}
        className="glass-strong w-full max-w-md rounded-3xl p-5 sm:p-7 max-h-[95vh] overflow-y-auto"
      >
        <div className="mb-4 flex flex-col items-center">
          <Link to="/" aria-label="Vibtune home" className="mb-3">
            <VibtuneLogo className="h-12 w-12 sm:h-14 sm:w-14" />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-center">Start your <span className="vibe-text">vibe</span></h1>
          <p className="mt-1.5 text-sm text-white/60 text-center">Sign up with Google, or with your email and a password.</p>
        </div>


        <button
          type="button" onClick={handleGoogle} disabled={googleLoading || loading}
          className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/95 py-3 font-semibold text-slate-900 transition hover:bg-white disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "Opening Google…" : "Continue with Google"}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wider text-white/40">
          <span className="h-px flex-1 bg-white/10" /> or email <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-4">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" placeholder="Your name" />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoComplete="email" placeholder="you@example.com" />
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password" required placeholder="Create a password"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white outline-none focus:ring-2 focus:ring-cyan-300/60"
              />
              <button
                type="button" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-3 flex items-center text-white/60 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-white/60">
              {rules.map((r) => (
                <li key={r.label} className="flex items-center gap-2">
                  {r.ok ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-white/40" />}
                  <span className={r.ok ? "text-white/80" : ""}>{r.label}</span>
                </li>
              ))}
            </ul>
          </label>
        </div>

        <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 whitespace-pre-wrap">
          {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                            \n                                            change the app color theme`}
        </p>

        <button
          type="submit" disabled={loading || googleLoading}
          className="vibe-gradient-h mt-6 w-full rounded-full py-3.5 font-semibold text-[#050b14] disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
        <p className="mt-6 text-center text-sm text-white/60">
          Already on Vibtune?{" "}
          <Link to="/login" search={next ? { next } : {}} className="text-white underline-offset-4 hover:underline">Log in</Link>
        </p>
      </motion.form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-transparent focus:ring-2 focus:ring-cyan-300/60"
      />
    </label>
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
