import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getLyrics } from "@/lib/lyrics.functions";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  artist: string;
  currentTime: number;
}

export function SyncedLyrics({ title, artist, currentTime }: Props) {
  const fn = useServerFn(getLyrics);
  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", title, artist],
    queryFn: () => fn({ data: { title, artist } }),
    staleTime: 1000 * 60 * 30,
  });

  const synced = data?.synced ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    if (!synced || synced.length === 0) return;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= currentTime) idx = i;
      else break;
    }
    if (idx !== activeIdx) setActiveIdx(idx);
  }, [currentTime, synced, activeIdx]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const el = lineRefs.current[activeIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  if (isLoading) {
    return (
      <div className="space-y-3 px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 w-3/4 animate-pulse rounded-md bg-white/5" />
        ))}
      </div>
    );
  }

  if (synced && synced.length > 0) {
    return (
      <div
        ref={containerRef}
        onPointerDownCapture={(e) => e.stopPropagation()}
        className="relative h-full overflow-y-auto overscroll-contain scroll-smooth px-4 pt-24 pb-32"
        style={{ scrollbarWidth: "none" }}
      >
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        {synced.map((line, i) => {
          const active = i === activeIdx;
          const past = i < activeIdx;
          return (
            <div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              className={cn(
                "py-2 text-center text-2xl font-bold leading-snug transition-all duration-500",
                active && "vibe-text scale-110",
                !active && past && "text-white/25 scale-95",
                !active && !past && "text-white/45 scale-100",
              )}
            >
              {line.text}
            </div>
          );
        })}
        <p className="mt-6 text-center text-xs text-white/30">
          Lyrics provided by LRCLIB
        </p>
      </div>
    );
  }

  if (data?.plain) {
    return (
      <div
        onPointerDownCapture={(e) => e.stopPropagation()}
        className="h-full overflow-y-auto overscroll-contain scroll-smooth px-4 pt-24 pb-32"
      >
        <pre className="whitespace-pre-wrap text-center text-base font-medium leading-relaxed text-white/70">
          {data.plain}
        </pre>
        <p className="mt-6 text-center text-xs text-white/30">
          Lyrics provided by LRCLIB
        </p>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid h-full place-items-center px-8 text-center"
      >
        <div>
          <p className="text-lg font-semibold text-white/70">No synced lyrics</p>
          <p className="mt-2 text-sm text-white/40">
            We couldn't find lyrics for this track on LRCLIB.
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
