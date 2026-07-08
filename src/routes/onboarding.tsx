import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { VibtuneLogo } from "@/components/VibtuneLogo";
import { LanguageStep } from "@/components/onboarding/LanguageStep";
import { ArtistStep } from "@/components/onboarding/ArtistStep";
import { SummaryStep } from "@/components/onboarding/SummaryStep";
import { StepDots } from "@/components/onboarding/StepDots";
import { saveOnboarding } from "@/lib/profile.functions";
import type { SpotifyArtistInfo } from "@/lib/music.types";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set your vibe · Vibtune" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const saveFn = useServerFn(saveOnboarding);

  const [step, setStep] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const [artists, setArtists] = useState<SpotifyArtistInfo[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  function toggleLang(lang: string) {
    setLanguages((p) => p.includes(lang) ? p.filter((l) => l !== lang) : [...p, lang]);
  }

  function toggleArtist(a: SpotifyArtistInfo) {
    setArtists((p) => p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]);
  }

  async function finish() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          languages,
          artists: artists.slice(0, 20).map((a) => ({
            id: a.id,
            name: a.name,
            hdPhotoUrl: a.hdPhotoUrl,
            isVerified: a.isVerified,
          })),
        },
      });
      toast.success("Your vibe is set");
      navigate({ to: "/app" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your picks");
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <VibtuneLogo className="h-9" />
        <StepDots step={step} total={3} />
      </div>

      <div className="mt-16">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <LanguageStep
              key="lang"
              selected={languages}
              onToggle={toggleLang}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <ArtistStep
              key="artist"
              languages={languages}
              selected={artists}
              onToggle={toggleArtist}
              onBack={() => setStep(0)}
              onFinish={() => setStep(2)}
              saving={false}
            />
          )}
          {step === 2 && (
            <SummaryStep
              key="summary"
              languages={languages}
              artists={artists}
              onToggleLang={toggleLang}
              onToggleArtist={toggleArtist}
              onBack={() => setStep(1)}
              onFinish={finish}
              saving={saving}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
