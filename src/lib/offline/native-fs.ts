/**
 * Native file storage for offline songs.
 *
 * On Android (Capacitor) downloaded audio is written to real files under
 * `Documents/Vibetune/`, so tracks survive webview storage eviction and are
 * visible to the OS file manager. On the web we fall back to IndexedDB.
 */

const DIR = "Vibetune";

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}

async function fs() {
  const mod = await import("@capacitor/filesystem");
  return mod;
}

function fileName(id: string) {
  return `${DIR}/${id}.mp3`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** True when downloads should be written to the device filesystem. */
export function hasNativeFiles(): boolean {
  return isNative();
}

/** Ensure the Vibetune folder exists and permissions are granted. */
export async function ensureNativeDir(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory } = await fs();
    const perm = await Filesystem.checkPermissions().catch(() => null);
    if (perm && perm.publicStorage !== "granted") {
      await Filesystem.requestPermissions().catch(() => null);
    }
    await Filesystem.mkdir({
      path: DIR,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

/** Write a downloaded track to the device filesystem. */
export async function writeNativeAudio(id: string, blob: Blob): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ensureNativeDir();
    const { Filesystem, Directory } = await fs();
    await Filesystem.writeFile({
      path: fileName(id),
      data: await blobToBase64(blob),
      directory: Directory.Documents,
      recursive: true,
    });
    return true;
  } catch (e) {
    console.warn("native write failed", e);
    return false;
  }
}

/** Playable file:// (or capacitor converted) URI for a downloaded track. */
export async function getNativeAudioUri(id: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { Filesystem, Directory } = await fs();
    const { uri } = await Filesystem.getUri({
      path: fileName(id),
      directory: Directory.Documents,
    });
    const cap = (window as any).Capacitor;
    return cap?.convertFileSrc ? cap.convertFileSrc(uri) : uri;
  } catch {
    return null;
  }
}

/** Remove a track's file from the device. */
export async function deleteNativeAudio(id: string): Promise<void> {
  if (!isNative()) return;
  try {
    const { Filesystem, Directory } = await fs();
    await Filesystem.deleteFile({
      path: fileName(id),
      directory: Directory.Documents,
    });
  } catch {
    /* already gone */
  }
}

/** Total bytes used by offline files on the device. */
export async function nativeUsageBytes(): Promise<number> {
  if (!isNative()) return 0;
  try {
    const { Filesystem, Directory } = await fs();
    const { files } = await Filesystem.readdir({
      path: DIR,
      directory: Directory.Documents,
    });
    return files.reduce((sum, f: any) => sum + (f.size || 0), 0);
  } catch {
    return 0;
  }
}
