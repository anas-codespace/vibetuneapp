import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Library, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/app", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--bottom-nav-h", `${el.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      root.style.removeProperty("--bottom-nav-h");
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 h-[72px] border-t border-white/5 bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex h-full max-w-md items-stretch justify-around px-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                active ? "text-pink-500" : "text-gray-500 hover:text-gray-300",
              )}
            >
              <Icon
                className="h-[22px] w-[22px]"
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className="tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
