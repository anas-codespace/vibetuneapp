import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { VibePlayerProvider } from "@/components/VibePlayer";
import { AppShell } from "@/components/AppShell";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back to login.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go to login
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vibtune — Feel the Vibe" },
      { name: "description", content: "A luxury music streaming experience. Discover artists, ride the vibe wave." },
      { name: "theme-color", content: "#050b14" },
      { property: "og:title", content: "Vibtune — Feel the Vibe" },
      { property: "og:description", content: "A luxury music streaming experience. Discover artists, ride the vibe wave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Vibtune — Feel the Vibe" },
      { name: "twitter:description", content: "A luxury music streaming experience. Discover artists, ride the vibe wave." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/AhzO8cA736bvtGgd3tPSDcAaiOA3/social-images/social-1783799353750-ChatGPT_Image_May_5,_2026,_05_11_12_PM.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/AhzO8cA736bvtGgd3tPSDcAaiOA3/social-images/social-1783799353750-ChatGPT_Image_May_5,_2026,_05_11_12_PM.webp" },
    ],
    links: [
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "preconnect", href: "https://cdn.fontshare.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],


  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const savedAccent = localStorage.getItem("vibtune-accent-color");
    if (savedAccent) {
      document.documentElement.style.setProperty("--primary", savedAccent);
      document.documentElement.style.setProperty("--ring", savedAccent);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <VibePlayerProvider>
        <AppShell />
        <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.1)", color: "white", backdropFilter: "blur(20px)" } }} />
      </VibePlayerProvider>
    </QueryClientProvider>
  );
}
