import { useEffect, useState } from "react";

/** True when the browser reports no network connection. */
export function isOffline() {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

/** Reactive online/offline state (false during SSR / first paint). */
export function useOnlineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(isOffline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return { offline, online: !offline };
}
