import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronLeft, Download, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDownloads } from "@/hooks/use-downloads";
import { usePlayer } from "@/components/VibePlayer";

export const Route = createFileRoute("/library/downloaded")({
  head: () => ({
    meta: [
      { title: "Downloaded · Vibtune" },
      { name: "description", content: "Your locally saved tracks." },
    ],
  }),
  component: DownloadedPage,
});

function DownloadedPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { items, remove, clear } = useDownloads();
  const { play } = usePlayer();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  return (
    <main className="relative min-h-screen px-5 pb-44 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <Link
          to="/library"
          aria-label="Back"
          className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold text-white">Downloaded</h1>
        <button
          onClick={clear}
          disabled={items.length === 0}
          aria-label="Clear all"
          className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <section className="mx-auto mt-6 max-w-md">
        <div className="relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5">
          <Download className="absolute -bottom-6 -right-6 h-32 w-32 rotate-12 text-white/10" />
          <h2 className="relative z-10 text-2xl font-bold text-white">Downloaded</h2>
          <p className="relative z-10 text-sm text-white/60">
            {items.length} {items.length === 1 ? "track" : "tracks"} saved on this device
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-md">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-12 text-center">
            <Download className="mb-4 h-12 w-12 text-white/40" />
            <h3 className="mb-2 text-lg font-medium text-white">Nothing saved yet</h3>
            <p className="max-w-xs text-sm text-white/50">
              Tap the download icon on any track to save it here for quick access.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.youtubeId} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5">
                <button
                  onClick={() => play(t, items)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{t.title}</p>
                    <p className="truncate text-xs text-white/50">{t.artist}</p>
                  </div>
                </button>
                <button
                  onClick={() => remove(t.youtubeId)}
                  aria-label="Remove from downloads"
                  className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
