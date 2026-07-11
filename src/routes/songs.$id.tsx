import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, Play } from "lucide-react";
import { getSongByYoutubeId } from "@/lib/songs.functions";
import { usePlayer } from "@/components/VibePlayer";

function secondsToISO8601(sec?: number | null): string | undefined {
  if (!sec || sec <= 0) return undefined;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `PT${m}M${s}S`;
}

export const Route = createFileRoute("/songs/$id")({
  loader: async ({ params }) => {
    const song = await getSongByYoutubeId({ data: { id: params.id } });
    if (!song) throw notFound();
    return { song };
  },
  head: ({ params, loaderData }) => {
    const url = `https://vibetuneapp.lovable.app/songs/${params.id}`;
    const song = loaderData?.song;
    const title = song ? `${song.title} — ${song.artist} · Vibtune` : "Song · Vibtune";
    const description = song
      ? `Listen to ${song.title} by ${song.artist} on Vibtune.`
      : "Listen on Vibtune.";
    const image = song?.thumbnail_url ?? `https://i.ytimg.com/vi/${params.id}/hqdefault.jpg`;
    const duration = secondsToISO8601(song?.duration_seconds);

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      "@id": url,
      url,
      name: song?.title ?? "Song",
      byArtist: { "@type": "MusicGroup", name: song?.artist ?? "Unknown Artist" },
      image,
      isPartOf: { "@type": "WebSite", name: "Vibtune", url: "https://vibetuneapp.lovable.app" },
    };
    if (duration) jsonLd.duration = duration;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "music.song" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
      ],
    };
  },
  notFoundComponent: SongNotFound,
  errorComponent: SongError,
  component: SongPage,
});

function SongNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <h1 className="text-xl font-bold text-white">Song not found</h1>
        <p className="mt-2 text-sm text-white/50">This track isn't in our catalog.</p>
        <Link to="/app" className="mt-4 inline-block text-sm text-white/80 underline">Go home</Link>
      </div>
    </main>
  );
}

function SongError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <h1 className="text-xl font-bold text-white">Couldn't load song</h1>
        <p className="mt-2 text-sm text-white/50">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white">Retry</button>
      </div>
    </main>
  );
}

function SongPage() {
  const { song } = Route.useLoaderData();
  const { play } = usePlayer();
  const thumb = song.thumbnail_url ?? `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`;

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="px-5">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Home
        </Link>
      </div>
      <header className="mx-auto mt-4 max-w-md px-5">
        <div className="mx-auto aspect-square w-64 overflow-hidden rounded-2xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
          <img src={thumb} alt={song.title} className="h-full w-full object-cover" />
        </div>
        <h1 className="mt-6 text-center text-2xl font-bold text-white">{song.title}</h1>
        <p className="mt-1 text-center text-sm text-white/60">{song.artist}</p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={() =>
              play({
                youtubeId: song.youtube_id,
                title: song.title,
                artist: song.artist,
                thumbnailUrl: thumb,
              })
            }
            className="vibe-gradient flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white"
          >
            <Play className="h-4 w-4" fill="currentColor" /> Play
          </button>
        </div>
      </header>
    </main>
  );
}
