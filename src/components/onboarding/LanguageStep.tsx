import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  "Tamil", "Hindi", "English", "Telugu",
  "Malayalam", "Kannada", "Punjabi", "Korean", "Spanish",
];

interface Props {
  selected: string[];
  onToggle: (lang: string) => void;
  onNext: () => void;
}

export function LanguageStep({ selected, onToggle, onNext }: Props) {
  const canContinue = selected.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="mx-auto max-w-2xl"
    >
      <h1 className="text-center text-4xl font-bold md:text-5xl">
        What <span className="vibe-text">languages</span> do you vibe to?
      </h1>
      <p className="mt-3 text-center text-white/60">Pick one or more. We'll handcraft your feed.</p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {LANGUAGES.map((lang, i) => {
          const active = selected.includes(lang);
          return (
            <motion.button
              key={lang}
              type="button"
              onClick={() => onToggle(lang)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "group relative inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-all",
                active
                  ? "vibe-gradient text-[#050b14] shadow-[0_0_30px_-8px_rgba(127,216,232,0.7)]"
                  : "glass text-white/80 hover:text-white",
              )}
            >
              {active && <Check className="h-4 w-4" />}
              {lang}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-12 flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className={cn(
            "rounded-full px-10 py-3.5 text-sm font-semibold transition-all",
            canContinue
              ? "vibe-gradient-h text-[#050b14] shadow-[0_0_40px_-10px_rgba(127,216,232,0.7)] hover:scale-105"
              : "cursor-not-allowed bg-white/5 text-white/30",
          )}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}
