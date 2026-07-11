import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchArtist, getRelatedArtistsByName, type SpotifyArtistInfo } from "./spotify.server";
import {
  searchMusic,
  relatedArtistNames,
  type YTTrack,
} from "./youtube.server";

/** Top seed artists by language (display order). */
const SEEDS_BY_LANG: Record<string, string[]> = {
  Tamil: ["Anirudh Ravichander", "A.R. Rahman", "Yuvan Shankar Raja", "Sid Sriram", "Harris Jayaraj", "Santhosh Narayanan", "Dhibu Ninan Thomas", "G.V. Prakash"],
  Hindi: ["Arijit Singh", "Pritam", "A.R. Rahman", "Shreya Ghoshal", "Vishal-Shekhar", "Amit Trivedi", "Neha Kakkar", "Badshah"],
  English: ["The Weeknd", "Taylor Swift", "Drake", "Billie Eilish", "Dua Lipa", "Ed Sheeran", "Bruno Mars", "Travis Scott"],
  Telugu: ["Devi Sri Prasad", "Thaman S", "M.M. Keeravani", "Anirudh Ravichander", "Sid Sriram"],
  Malayalam: ["Sushin Shyam", "Gopi Sundar", "Vidyasagar", "Sid Sriram"],
  Kannada: ["B. Ajaneesh Loknath", "V. Harikrishna", "Vasuki Vaibhav"],
  Punjabi: ["Diljit Dosanjh", "AP Dhillon", "Sidhu Moose Wala", "Karan Aujla", "Shubh"],
  Korean: ["BTS", "BLACKPINK", "NewJeans", "IU", "Stray Kids"],
  Spanish: ["Bad Bunny", "Rosalía", "Karol G", "J Balvin", "Rauw Alejandro"],
};

export const getSeedArtists = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ languages: z.array(z.string()).min(1).max(10) }).parse(d),
  )
  .handler(async ({ data }): Promise<SpotifyArtistInfo[]> => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const lang of data.languages) {
      for (const name of SEEDS_BY_LANG[lang] ?? []) {
        const k = name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        names.push(name);
      }
    }
    const results = await Promise.all(names.slice(0, 18).map(searchArtist));
    return results.filter((a): a is SpotifyArtistInfo => a !== null && a.hdPhotoUrl !== null);
  });

export const expandSimilarArtists = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ seedArtistName: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data }): Promise<SpotifyArtistInfo[]> => {
    // Combine Spotify genre-related and YouTube channel-derived names.
    const [spot, ytNames] = await Promise.all([
      getRelatedArtistsByName(data.seedArtistName, 6),
      relatedArtistNames(data.seedArtistName, 6),
    ]);
    const merged: SpotifyArtistInfo[] = [...spot];
    const have = new Set(merged.map((a) => a.name.toLowerCase()));
    have.add(data.seedArtistName.toLowerCase());
    const fetched = await Promise.all(
      ytNames.filter((n) => !have.has(n.toLowerCase())).slice(0, 4).map(searchArtist),
    );
    for (const a of fetched) {
      if (a && a.hdPhotoUrl && !have.has(a.name.toLowerCase())) {
        have.add(a.name.toLowerCase());
        merged.push(a);
      }
    }
    return merged.slice(0, 10);
  });

export const searchTracks = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ query: z.string().min(1).max(200), max: z.number().int().min(1).max(40).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<YTTrack[]> => {
    return searchMusic(data.query, data.max ?? 20);
  });

export const tracksForArtists = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ artists: z.array(z.string()).min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }): Promise<YTTrack[]> => {
    const results = await Promise.all(
      data.artists.slice(0, 10).map((a) => searchMusic(`${a} official audio`, 15)),
    );
    const seen = new Set<string>();
    const out: YTTrack[] = [];
    for (const list of results) for (const t of list) {
      if (seen.has(t.youtubeId)) continue;
      seen.add(t.youtubeId);
      out.push(t);
    }
    return out;
  });
