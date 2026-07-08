// Bridge between the VibePlayer and the Capacitor Android AudioBackground plugin.
// On Android, starts a foreground service so audio keeps playing when the app
// is backgrounded. On web/iOS this is a no-op.

let _plugin: any = null;

async function getPlugin() {
  if (_plugin !== null) return _plugin;
  try {
    const cap = await import("@capacitor/core");
    if (cap.Capacitor.isNativePlatform()) {
      _plugin = cap.Capacitor.isPluginAvailable("AudioBackground")
        ? (cap.Capacitor as unknown as { Plugins: Record<string, any> }).Plugins.AudioBackground
        : null;
    } else {
      _plugin = null;
    }
  } catch {
    _plugin = null;
  }
  return _plugin;
}

export async function startAudioForeground() {
  const plugin = await getPlugin();
  if (plugin) plugin.startForeground();
}

export async function stopAudioForeground() {
  const plugin = await getPlugin();
  if (plugin) plugin.stopForeground();
}
