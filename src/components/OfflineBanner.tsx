import { WifiOff, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Persistent banner shown whenever the device loses connectivity. Points the
 * user at the only content that still works: their downloads.
 */
export function OfflineBanner() {
  const { offline } = useOnlineStatus();
  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-3 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto mt-2 flex max-w-lg items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        <WifiOff className="h-4 w-4 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          You're offline — only downloaded music is available.
        </p>
        <Link
          to="/library/downloaded"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        >
          <Download className="h-3 w-3" />
          Downloads
        </Link>
      </div>
    </div>
  );
}
