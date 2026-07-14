import { useQuery } from "@tanstack/react-query";
import { SafeArt } from "./SafeArt";

/**
 * CleanArt — resolves a text-free, correctly-matched cover image for a track
 * or artist via Deezer, and falls back to the YouTube thumbnail (through
 * SafeArt) only when Deezer has nothing. Never surfaces a YouTube thumbnail
 * if a clean cover is available.
 *
 * mode:
 *  - "track"  → Deezer album cover for `artist` + `title` (strict match).
 *  - "artist" → Deezer artist picture for `artist` (used by radio cards).
 *
 * `fallbackSrc` is the current YouTube thumbnail. It is used only if the
 * Deezer lookup returns null.
 */
export function CleanArt({
  mode,
  artist,
  title,
  fallbackSrc,
  alt,
  className,
  fallbackClassName,
}: {
  mode: "track" | "artist";
  artist: string | undefined;
  title?: string | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const enabled =
    mode === "artist" ? !!artist?.trim() : !!(artist?.trim() && title?.trim());

  const { data } = useQuery<{ image: string | null }>({
    queryKey: ["clean-art", mode, (artist ?? "").toLowerCase(), (title ?? "").toLowerCase()],
    queryFn: async () => {
      const url =
        mode === "artist"
          ? `/api/public/artist-image?name=${encodeURIComponent(artist ?? "")}`
          : `/api/public/track-cover?artist=${encodeURIComponent(artist ?? "")}&title=${encodeURIComponent(title ?? "")}`;
      const res = await fetch(url);
      if (!res.ok) return { image: null };
      return (await res.json()) as { image: string | null };
    },
    enabled,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  const clean = data?.image ?? null;
  // Prefer the clean Deezer artwork. Only fall back to the YouTube thumbnail
  // (which may contain baked-in text) when Deezer truly has nothing.
  const src = clean ?? fallbackSrc ?? null;
  return (
    <SafeArt src={src} alt={alt} className={className} fallbackClassName={fallbackClassName} />
  );
}
