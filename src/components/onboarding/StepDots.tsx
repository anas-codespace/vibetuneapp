import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  step: number;
  total: number;
}

export function StepDots({ step, total }: Props) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i === step ? 32 : 8 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={cn(
            "h-2 rounded-full",
            i <= step ? "vibe-gradient-h" : "bg-white/15",
          )}
        />
      ))}
    </div>
  );
}
