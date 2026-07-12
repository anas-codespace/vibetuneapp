import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { spotifyAvailability, type SpotifyAvailability } from "@/lib/spotify.functions";

export function useSpotifyAvailability() {
  const fn = useServerFn(spotifyAvailability);
  const query = useQuery({
    queryKey: ["spotify-availability"],
    queryFn: () => fn({ data: {} }) as Promise<SpotifyAvailability>,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const status = query.data?.status;
  return {
    ...query,
    status,
    isAvailable: status === "ok",
    isBlocked: !!status && status !== "ok",
  };
}
