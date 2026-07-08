import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { VibtuneLogo } from "@/components/VibtuneLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vibtune — Feel the Vibe" },
      { name: "description", content: "A luxury music streaming experience. Discover, vibe, repeat." },
      { property: "og:title", content: "Vibtune — Feel the Vibe" },
      { property: "og:description", content: "A luxury music streaming experience." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <VibtuneLogo className="h-10 w-auto" />
        <nav className="flex items-center gap-3">
          <Link to="/login" className="rounded-full px-5 py-2 text-sm text-white/80 transition hover:text-white">
            Log in
          </Link>
          <Link
            to="/signup"
            className="vibe-gradient-h rounded-full px-5 py-2 text-sm font-semibold text-white shadow-[0_0_30px_-5px_rgba(236,0,140,0.6)] transition hover:scale-105"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="glass mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-white/70"
        >
          <span className="vibe-gradient h-2 w-2 animate-vibe-pulse rounded-full" />
          Now in private beta
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
          className="text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl"
        >
          Feel the <span className="vibe-text">Vibe</span>.<br />Not the noise.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg text-white/60 md:text-xl"
        >
          A luxury listening engine that learns your taste in seconds.
          Discover artists, ride the wave, and own your sound — beautifully.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            to="/signup"
            className="vibe-gradient-h animate-breathe rounded-full px-8 py-4 text-base font-semibold text-white"
          >
            Start your vibe
          </Link>
          <Link
            to="/login"
            className="glass rounded-full px-8 py-4 text-base font-semibold text-white/90 transition hover:bg-white/10"
          >
            I have an account
          </Link>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          { t: "Smart Onboarding", d: "Pick a language, choose your artists. We expand your taste using YouTube + Spotify signals." },
          { t: "Mood-Aware Engine", d: "Every track gets a vibe tag — Vera Level, Kadaisi Bench, Summa Chill — powered by Librosa." },
          { t: "Lossless UI", d: "Frosted glass, gradient borders, a floating player. Built for the way music should look." },
        ].map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="gradient-border p-6"
          >
            <div className="vibe-gradient mb-4 h-1 w-12 rounded-full" />
            <h3 className="mb-2 text-lg font-semibold text-white">{f.t}</h3>
            <p className="text-sm text-white/60">{f.d}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
