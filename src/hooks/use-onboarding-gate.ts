import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Force-redirects signed-in users to /onboarding until they've completed
 * onboarding (picked languages + artists). Skip on /onboarding itself.
 */
export function useOnboardingGate() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profileFn = useServerFn(getMyProfile);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    enabled: !!session,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (pathname.startsWith("/onboarding")) return;
    const done =
      (profile as { onboarded?: boolean | null }).onboarded === true ||
      (Array.isArray((profile as { fav_artists?: unknown[] | null }).fav_artists) &&
        ((profile as { fav_artists?: unknown[] }).fav_artists?.length ?? 0) > 0);
    if (!done) navigate({ to: "/onboarding" });
  }, [loading, session, profile, pathname, navigate]);
}
