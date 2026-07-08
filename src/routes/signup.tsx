import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · Vibtune" }] }),
  component: SignupPage,
});

const SignupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

function SignupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

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
    toast.success("Check your inbox for the 6-digit code.");
    navigate({ to: "/verify", search: { email: parsed.data.email } });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <Link to="/" className="absolute left-6 top-6"><VibtuneLogo className="h-9" /></Link>
      <motion.form
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        onSubmit={handleSubmit}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <h1 className="mb-2 text-3xl font-bold">Start your <span className="vibe-text">vibe</span></h1>
        <p className="mb-8 text-sm text-white/60">Create an account in seconds.</p>

        <div className="space-y-4">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoComplete="email" />
          <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="new-password" />
        </div>

        <button
          type="submit" disabled={loading}
          className="vibe-gradient-h mt-8 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
        <p className="mt-6 text-center text-sm text-white/60">
          Already on Vibtune?{" "}
          <Link to="/login" className="text-white underline-offset-4 hover:underline">Log in</Link>
        </p>
      </motion.form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-transparent focus:ring-2 focus:ring-pink-500/60"
      />
    </label>
  );
}
