import type { VibeTrack } from "@/components/VibePlayer";

/**
 * Static fallback tracks used when API calls fail or return empty.
 * These are well-known official music videos so sections never render blank.
 */
export const FALLBACK_TRACKS: VibeTrack[] = [
  {
    youtubeId: "AVjIcDap-b0",
    title: "Hukum — Thalaivar Alappara",
    artist: "Anirudh Ravichander",
    thumbnailUrl: "https://i.ytimg.com/vi/AVjIcDap-b0/hqdefault.jpg",
    durationSeconds: 234,
  },
  {
    youtubeId: "AjTaN4XVNRM",
    title: "Naa Ready",
    artist: "Anirudh Ravichander, Thalapathy Vijay",
    thumbnailUrl: "https://i.ytimg.com/vi/AjTaN4XVNRM/hqdefault.jpg",
    durationSeconds: 210,
  },
  {
    youtubeId: "Sw2ycVGvxvo",
    title: "Illuminati",
    artist: "Sushin Shyam",
    thumbnailUrl: "https://i.ytimg.com/vi/Sw2ycVGvxvo/hqdefault.jpg",
    durationSeconds: 232,
  },
  {
    youtubeId: "VbfpW0pbvaU",
    title: "Chaleya",
    artist: "Arijit Singh, Shilpa Rao",
    thumbnailUrl: "https://i.ytimg.com/vi/VbfpW0pbvaU/hqdefault.jpg",
    durationSeconds: 213,
  },
  {
    youtubeId: "Way9Dexny3w",
    title: "Kesariya",
    artist: "Arijit Singh",
    thumbnailUrl: "https://i.ytimg.com/vi/Way9Dexny3w/hqdefault.jpg",
    durationSeconds: 268,
  },
  {
    youtubeId: "BddP6PYo2gs",
    title: "Vaathi Coming",
    artist: "Anirudh Ravichander",
    thumbnailUrl: "https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg",
    durationSeconds: 217,
  },
];
