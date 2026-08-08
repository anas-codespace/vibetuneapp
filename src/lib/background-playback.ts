// Keeps audio alive when the app is backgrounded (tab hidden, screen off,
// another app in front). Three layers:
//   1. A silent looping WebAudio buffer that keeps the browser's audio context
//      "active" so mobile browsers don't suspend timers/media for the tab.
//   2. A Screen Wake Lock (re-acquired after visibility changes) so playback
//      isn't throttled while the device idles, where supported.
//   3. A watchdog that re-issues play() when we return to the foreground and
//      the embedded player was silently paused by the OS.

let audioCtx: AudioContext | null = null;
let silentSource: AudioBufferSourceNode | null = null;
let wakeLock: any = null;
let started = false;
let shouldBePlaying = false;
let resumeFn: (() => void) | null = null;
let visibilityBound = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Starts an inaudible looping tone so the audio session stays alive. */
function startSilentLoop() {
  if (!isBrowser() || silentSource) return;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0001; // effectively silent, but a real output signal

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start(0);
    silentSource = source;
  } catch {
    /* audio keep-alive unsupported — ignore */
  }
}

function stopSilentLoop() {
  try {
    silentSource?.stop();
  } catch {
    /* ignore */
  }
  silentSource = null;
  try {
    void audioCtx?.suspend();
  } catch {
    /* ignore */
  }
}

async function acquireWakeLock() {
  if (!isBrowser()) return;
  try {
    const nav = navigator as any;
    if (!nav.wakeLock?.request) return;
    if (wakeLock) return;
    wakeLock = await nav.wakeLock.request("screen");
    wakeLock.addEventListener?.("release", () => {
      wakeLock = null;
    });
  } catch {
    /* wake lock denied — ignore */
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release?.();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

function bindVisibility() {
  if (!isBrowser() || visibilityBound) return;
  visibilityBound = true;

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (!shouldBePlaying) return;
    // Re-arm everything the OS may have torn down while we were hidden.
    if (audioCtx?.state === "suspended") void audioCtx.resume();
    void acquireWakeLock();
    // Nudge the embedded player in case it was paused in the background.
    resumeFn?.();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  window.addEventListener("focus", onVisible);
}

/**
 * Enable background playback support. Call when playback starts.
 * `onResume` is invoked when we come back to the foreground and playback
 * should still be running.
 */
export function enableBackgroundPlayback(onResume?: () => void) {
  if (!isBrowser()) return;
  shouldBePlaying = true;
  resumeFn = onResume ?? resumeFn;
  bindVisibility();
  if (!started) {
    started = true;
    startSilentLoop();
  } else if (audioCtx?.state === "suspended") {
    void audioCtx.resume();
  }
  void acquireWakeLock();
}

/** Pause background keep-alive (playback paused) without tearing everything down. */
export function pauseBackgroundPlayback() {
  shouldBePlaying = false;
  void releaseWakeLock();
}

/** Fully disable background playback (player closed). */
export function disableBackgroundPlayback() {
  shouldBePlaying = false;
  started = false;
  resumeFn = null;
  stopSilentLoop();
  void releaseWakeLock();
}
