// Bridge between the VibePlayer and the Capacitor Android AudioBackground plugin.
// On Android this drives a MediaSession-backed foreground service: rich
// "Now Playing" notification, lock-screen controls, Bluetooth/Android Auto and
// headset media buttons. On the web/iOS we fall back to the standard
// navigator.mediaSession API (which powers iOS Now Playing / Dynamic Island).

export type MediaControlAction = "play" | "pause" | "next" | "prev" | "stop" | "seek";

export type NowPlaying = {
  title: string;
  artist: string;
  artwork?: string;
  isPlaying: boolean;
  position?: number; // ms
  duration?: number; // ms
};

let _plugin: any = null;
let _resolved = false;

async function getPlugin() {
  if (_resolved) return _plugin;
  _resolved = true;
  try {
    const cap = await import("@capacitor/core");
    if (cap.Capacitor.isNativePlatform() && cap.Capacitor.isPluginAvailable("AudioBackground")) {
      _plugin = (cap.Capacitor as unknown as { Plugins: Record<string, any> }).Plugins.AudioBackground;
    }
  } catch {
    _plugin = null;
  }
  return _plugin;
}

export async function requestNotificationPermission() {
  const plugin = await getPlugin();
  try {
    await plugin?.requestPermissions?.();
  } catch {
    /* ignore */
  }
}

export async function startAudioForeground(info?: NowPlaying) {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.startForeground(
      info ?? { title: "Vibetune", artist: "", artwork: "", isPlaying: true, position: 0, duration: 0 },
    );
  } catch {
    /* ignore */
  }
}

export async function updateNowPlaying(info: NowPlaying) {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.updateNowPlaying({
      title: info.title,
      artist: info.artist,
      artwork: info.artwork ?? "",
      isPlaying: info.isPlaying,
      position: Math.round(info.position ?? 0),
      duration: Math.round(info.duration ?? 0),
    });
  } catch {
    /* ignore */
  }
}

export async function stopAudioForeground() {
  const plugin = await getPlugin();
  try {
    await plugin?.stopForeground();
  } catch {
    /* ignore */
  }
}

/** Subscribe to native transport events (notification / lock screen / headset). */
export async function onMediaControl(
  handler: (action: MediaControlAction, payload?: { position?: number }) => void,
) {
  const plugin = await getPlugin();
  if (!plugin?.addListener) return () => {};
  const sub = await plugin.addListener("mediaControl", (e: { action: MediaControlAction; position?: number }) => {
    handler(e.action, { position: e.position });
  });
  return () => sub?.remove?.();
}

/**
 * Publishes metadata to the browser MediaSession API. This is what renders the
 * iOS Now Playing card (and the Dynamic Island live activity on supported
 * iPhones), plus desktop OS media widgets.
 */
export function setWebMediaSession(
  info: NowPlaying | null,
  handlers: {
    play: () => void;
    pause: () => void;
    next: () => void;
    prev: () => void;
    seek?: (seconds: number) => void;
    stop?: () => void;
  },
) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  if (!info) {
    ms.metadata = null;
    ms.playbackState = "none";
    return;
  }
  try {
    ms.metadata = new window.MediaMetadata({
      title: info.title,
      artist: info.artist,
      album: "Vibetune",
      artwork: info.artwork
        ? [
            { src: info.artwork, sizes: "96x96", type: "image/jpeg" },
            { src: info.artwork, sizes: "256x256", type: "image/jpeg" },
            { src: info.artwork, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
    ms.playbackState = info.isPlaying ? "playing" : "paused";
    ms.setActionHandler("play", handlers.play);
    ms.setActionHandler("pause", handlers.pause);
    ms.setActionHandler("nexttrack", handlers.next);
    ms.setActionHandler("previoustrack", handlers.prev);
    ms.setActionHandler("stop", handlers.stop ?? (() => {}));
    if (handlers.seek) {
      ms.setActionHandler("seekto", (d: any) => {
        if (typeof d.seekTime === "number") handlers.seek!(d.seekTime);
      });
    }
    if (info.duration && info.duration > 0) {
      ms.setPositionState?.({
        duration: info.duration / 1000,
        position: Math.min((info.position ?? 0) / 1000, info.duration / 1000),
        playbackRate: 1,
      });
    }
  } catch {
    /* ignore */
  }
}
