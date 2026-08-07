import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Palette, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/theme")({
  component: ThemeSettingsPage,
  head: () => ({
    meta: [
      { title: "Theme Settings · Vibtune" },
      { name: "description", content: "Customize your Vibtune experience with personalized neon accent colors." },
    ],
  }),
});

const DEFAULT_ACCENTS = [
  { name: "Neon Pink", hex: "#ff007f", oklch: "oklch(0.65 0.3 0)" },
  { name: "Electric Cyan", hex: "#00f2ff", oklch: "oklch(0.85 0.2 200)" },
  { name: "Vibrant Purple", hex: "#bc13fe", oklch: "oklch(0.6 0.3 300)" },
  { name: "Acid Green", hex: "#dfff00", oklch: "oklch(0.88 0.25 100)" },
  { name: "Blaze Orange", hex: "#ff6b00", oklch: "oklch(0.7 0.25 45)" },
  { name: "Laser Blue", hex: "#007fff", oklch: "oklch(0.6 0.2 250)" },
];

function ThemeSettingsPage() {
  const [accent, setAccent] = useState("");
  const [customHex, setCustomHex] = useState("#ff007f");

  useEffect(() => {
    const saved = localStorage.getItem("vibtune-accent-color");
    if (saved) {
      setAccent(saved);
      setCustomHex(saved.startsWith("#") ? saved : "#ff007f");
      document.documentElement.style.setProperty("--primary", saved);
      document.documentElement.style.setProperty("--ring", saved);
    }
  }, []);

  const handleAccentChange = (value: string) => {
    setAccent(value);
    document.documentElement.style.setProperty("--primary", value);
    document.documentElement.style.setProperty("--ring", value);
    localStorage.setItem("vibtune-accent-color", value);
    toast.success("Accent color updated live!");
  };

  const resetTheme = () => {
    localStorage.removeItem("vibtune-accent-color");
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--ring");
    setAccent("");
    toast.info("Theme reset to default.");
  };

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <header className="sticky top-0 z-10 glass px-6 py-8">
        <div className="flex items-center gap-3">
          <Palette className="h-8 w-8 text-primary animate-pulse" />
          <h1 className="text-3xl font-bold">Theme Customization</h1>
        </div>
        <p className="mt-2 text-white/60">Personalize your Cyberpunk Neon interface.</p>
      </header>

      <main className="flex-1 p-6 space-y-10 max-w-2xl mx-auto w-full">
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <div className="h-1.5 w-6 vibe-gradient rounded-full" />
              Accent Color
            </h2>
            <button 
              onClick={resetTheme}
              className="text-xs uppercase tracking-widest text-white/40 hover:text-white transition flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              Reset Default
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {DEFAULT_ACCENTS.map((color) => (
              <button
                key={color.hex}
                onClick={() => handleAccentChange(color.oklch)}
                className="group relative flex flex-col items-center gap-2"
              >
                <div 
                  className="h-12 w-12 rounded-2xl border-2 transition-all duration-300 group-hover:scale-110 flex items-center justify-center shadow-lg shadow-black/50"
                  style={{ 
                    backgroundColor: color.hex, 
                    borderColor: accent === color.oklch ? "white" : "rgba(255,255,255,0.1)" 
                  }}
                >
                  {accent === color.oklch && <Check className="h-6 w-6 text-black" />}
                </div>
                <span className="text-[10px] uppercase tracking-tighter text-white/40 group-hover:text-white transition">
                  {color.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-white/90">
            <div className="h-1.5 w-6 bg-white/20 rounded-full" />
            Custom Hex Code
          </h2>
          <div className="glass-strong p-6 rounded-3xl flex flex-col sm:flex-row items-center gap-6">
            <div 
              className="h-24 w-24 rounded-3xl shadow-2xl border-4 border-white/10 shrink-0"
              style={{ backgroundColor: customHex }}
            />
            <div className="flex-1 space-y-4 w-full">
              <p className="text-sm text-white/60">Enter any hex code to set your own custom vibe.</p>
              <div className="relative">
                <input 
                  type="text" 
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  placeholder="#00FF00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50 transition font-mono uppercase"
                />
                <button 
                  onClick={() => handleAccentChange(customHex)}
                  className="absolute right-2 top-2 bottom-2 vibe-gradient px-4 rounded-lg text-black font-bold text-xs uppercase hover:brightness-110 transition"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-white/90">
            <div className="h-1.5 w-6 bg-white/20 rounded-full" />
            Live Preview
          </h2>
          <div className="glass p-8 rounded-3xl space-y-6 relative overflow-hidden border-primary/20">
            {/* Background Glow */}
            <div 
              className="absolute -top-24 -right-24 h-64 w-64 blur-[100px] opacity-20 pointer-events-none"
              style={{ backgroundColor: accent || "var(--vibe-magenta)" }}
            />

            <div className="space-y-2">
              <div className="h-1 w-12 vibe-gradient rounded-full" />
              <h3 className="text-2xl font-bold">Track Name</h3>
              <p className="text-primary font-medium">Artist Name</p>
            </div>

            <div className="flex items-center gap-4">
              <button className="vibe-gradient px-8 py-3 rounded-full text-black font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95">
                Play Now
              </button>
              <button className="h-12 w-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition">
                <Settings className="h-5 w-5 text-white/60" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/40">
                <span>0:42</span>
                <span>3:15</span>
              </div>
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "30%" }}
                  animate={{ width: "65%" }}
                  className="h-full vibe-gradient" 
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
