import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Sliders } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const QUALITY_KEY = "vibtune.audio.quality";
const EQ_KEY = "vibtune.audio.eq";
const AUTOPLAY_KEY = "vibtune.audio.autoplay";
const NORMALIZE_KEY = "vibtune.audio.normalize";

const QUALITIES = [
  { id: "auto", label: "Automatic", desc: "Adapts to your connection" },
  { id: "low", label: "Low", desc: "~96 kbps · saves data" },
  { id: "normal", label: "Normal", desc: "~160 kbps" },
  { id: "high", label: "High", desc: "~256 kbps" },
  { id: "very_high", label: "Very High", desc: "~320 kbps" },
] as const;

const EQ_PRESETS = [
  "Flat",
  "Bass Boost",
  "Vocal",
  "Acoustic",
  "Electronic",
  "Hip-Hop",
  "Rock",
  "Classical",
] as const;

export const Route = createFileRoute("/settings/audio")({
  head: () => ({
    meta: [
      { title: "Audio Quality & EQ · Vibtune" },
      { name: "description", content: "Choose streaming quality and equalizer presets." },
    ],
  }),
  component: AudioSettingsPage,
});

function AudioSettingsPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [quality, setQuality] = useState<string>("auto");
  const [eq, setEq] = useState<string>("Flat");
  const [autoplay, setAutoplay] = useState(true);
  const [normalize, setNormalize] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    try {
      setQuality(localStorage.getItem(QUALITY_KEY) ?? "auto");
      setEq(localStorage.getItem(EQ_KEY) ?? "Flat");
      setAutoplay(localStorage.getItem(AUTOPLAY_KEY) !== "false");
      setNormalize(localStorage.getItem(NORMALIZE_KEY) === "true");
    } catch {}
  }, []);

  const persist = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mx-auto max-w-md px-4">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-white">Audio Quality & EQ</h1>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 px-1 text-xs font-bold tracking-widest text-white/40">
            STREAMING QUALITY
          </h2>
          <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-2">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  setQuality(q.id);
                  persist(QUALITY_KEY, q.id);
                  toast.success(`Quality set to ${q.label}`);
                }}
                className={`flex items-center justify-between rounded-xl p-3 text-left transition-colors ${
                  quality === q.id ? "bg-violet-400/15" : "hover:bg-white/5"
                }`}
              >
                <div>
                  <p className="font-medium text-white/90">{q.label}</p>
                  <p className="text-xs text-white/50">{q.desc}</p>
                </div>
                <span
                  className={`h-4 w-4 rounded-full border ${
                    quality === q.id
                      ? "border-violet-300 bg-violet-300"
                      : "border-white/30"
                  }`}
                />
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 px-1 text-xs font-bold tracking-widest text-white/40">
            EQUALIZER PRESET
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {EQ_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setEq(p);
                  persist(EQ_KEY, p);
                }}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                  eq === p
                    ? "border-violet-300/60 bg-violet-400/10 text-white"
                    : "border-white/5 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                <Sliders size={16} className="text-white/50" />
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-2">
          <h2 className="mb-3 px-1 text-xs font-bold tracking-widest text-white/40">
            PLAYBACK
          </h2>
          <Toggle
            label="Autoplay related songs"
            desc="Keep the music going when your queue ends"
            value={autoplay}
            onChange={(v) => {
              setAutoplay(v);
              persist(AUTOPLAY_KEY, String(v));
            }}
          />
          <Toggle
            label="Volume normalization"
            desc="Even out loudness across tracks"
            value={normalize}
            onChange={(v) => {
              setNormalize(v);
              persist(NORMALIZE_KEY, String(v));
            }}
          />
          <Toggle
            label="Download on Wi‑Fi only"
            desc="Saves mobile data by waiting for Wi‑Fi"
            value={localStorage.getItem("vibtune.audio.wifi_only") === "true"}
            onChange={(v) => persist("vibtune.audio.wifi_only", String(v))}
          />

        </section>
      </div>
    </main>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 text-left hover:bg-white/10"
    >
      <div>
        <p className="font-medium text-white/90">{label}</p>
        {desc && <p className="text-xs text-white/50">{desc}</p>}
      </div>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          value ? "bg-violet-400" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
