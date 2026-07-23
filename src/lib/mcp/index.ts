import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLikedSongs from "./tools/list-liked-songs";
import listPlaylists from "./tools/list-playlists";
import recentListens from "./tools/recent-listens";
import tasteProfile from "./tools/taste-profile";
import logListen from "./tools/log-listen";

// Direct Supabase issuer (never the .lovable.cloud proxy). VITE_SUPABASE_PROJECT_ID
// is inlined at build time by Vite. The fallback keeps the issuer well-formed
// during the throwaway manifest-extract eval; real published builds inline the
// actual ref, and a token never verifies against the sentinel.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vibtune-mcp",
  title: "Vibtune MCP",
  version: "0.1.0",
  instructions:
    "Vibtune music tools scoped to the signed-in user: read liked songs, playlists, listening history, and taste profile, and log listens.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLikedSongs, listPlaylists, recentListens, tasteProfile, logListen],
});
