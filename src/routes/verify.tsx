import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VibtuneLogo } from "@/components/VibtuneLogo";

const SearchSchema = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verify · Vibtune" }] }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: VerifyPage,
});

function VerifyPage() {
  const { email: initialEmail } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Verified — welcome to Vibtune.");
    navigate({ to: "/onboarding" });
  }

  async function resend() {
    if (!email) { toast.error("Enter your email first"); return; }
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) toast.error(error.message); else toast.success("Code re-sent.");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <Link to="/" className="absolute left-6 top-6"><VibtuneLogo className="h-9" /></Link>
      <motion.form
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        onSubmit={handleVerify}
        className="glass-strong w-full max-w-md rounded-3xl p-8 text-center"
      >
        <div className="vibe-gradient mx-auto mb-6 h-14 w-14 animate-breathe rounded-2xl" />
        <h1 className="mb-2 text-3xl font-bold">Check your <span className="vibe-text">inbox</span></h1>
        <p className="mb-8 text-sm text-white/60">We sent a 6-digit code to <span className="text-white/90">{email || "your email"}</span></p>

        {!initialEmail && (
          <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500/60" />
        )}
        <input
          inputMode="numeric" maxLength={6} required value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-pink-500/60"
        />
        <button type="submit" disabled={loading}
          className="vibe-gradient-h mt-6 w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Verifying…" : "Verify & continue"}
        </button>
        <button type="button" onClick={resend} className="mt-4 text-sm text-white/60 hover:text-white">
          Didn't get it? Resend
        </button>
      </motion.form>
    </main>
  );
}
