import { Outlet, useRouterState } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";

const NAV_ROUTES = ["/app", "/search", "/library", "/profile"];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showNav = NAV_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  return (
    <>
      <OfflineBanner />
      <Outlet />
      {showNav && <BottomNav />}
    </>
  );
}
