import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders an artwork image and falls back to a branded gradient tile when:
 *  - the src is missing / errors, or
 *  - the loaded image is YouTube's "video unavailable" placeholder
 *    (hqdefault/mqdefault comes back at 120×90 instead of 480×360).
 */
export function SafeArt({
  src,
  alt,
  className,
  fallbackClassName = "vibe-gradient",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <div className={cn("h-full w-full", fallbackClassName, className)} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn("h-full w-full object-cover", className)}
      onError={() => setBroken(true)}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth > 0 && img.naturalWidth <= 200) setBroken(true);
      }}
    />
  );
}
