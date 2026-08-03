import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const KEY = "vibtune.notifications";

type Prefs = {
  newReleases: boolean;
  recommendations: boolean;
  playlistUpdates: boolean;
  productNews: boolean;
  email: boolean;
  push: boolean;
};

const DEFAULTS: Prefs = {
  newReleases: true,
  recommendations: true,
  playlistUpdates: true,
  productNews: false,
  email: true,
  push: false,
};

export const Route = createFileRoute("/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Vibtune" },
      { name: "description", content: "Choose what Vibtune notifies you about." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const enablePush = async (v: boolean) => {
    if (!v) {
      update({ push: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error("Push not supported on this device");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        update({ push: true });
        toast.success("Push notifications enabled");
      } else {
        toast.error("Permission denied");
      }
    } catch {
      toast.error("Couldn't enable push");
    }
  };

  const groups: { title: string; items: { key: keyof Prefs; label: string; desc: string }[] }[] = [
    {
      title: "MUSIC",
      items: [
        { key: "newReleases", label: "New releases", desc: "From artists you follow" },
        { key: "recommendations", label: "Recommendations", desc: "Fresh picks for you" },
        { key: "playlistUpdates", label: "Playlist updates", desc: "When your playlists change" },
      ],
    },
    {
      title: "GENERAL",
      items: [{ key: "productNews", label: "Product news", desc: "Tips and new features" }],
    },
  ];

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mx-auto max-w-md px-4">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-white">Notifications</h1>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 px-1 text-xs font-bold tracking-widest text-white/40">
            CHANNELS
          </h2>
          <div className="flex flex-col gap-2">
            <Toggle
              label="Email"
              desc="Receive updates in your inbox"
              value={prefs.email}
              onChange={(v) => update({ email: v })}
            />
            <Toggle
              label="Push"
              desc="Alerts on this device"
              value={prefs.push}
              onChange={enablePush}
            />
          </div>
        </section>

        {groups.map((g) => (
          <section key={g.title} className="mt-8">
            <h2 className="mb-3 px-1 text-xs font-bold tracking-widest text-white/40">
              {g.title}
            </h2>
            <div className="flex flex-col gap-2">
              {g.items.map((it) => (
                <Toggle
                  key={it.key}
                  label={it.label}
                  desc={it.desc}
                  value={prefs[it.key]}
                  onChange={(v) => update({ [it.key]: v } as Partial<Prefs>)}
                />
              ))}
            </div>
          </section>
        ))}

        <p className="mt-8 flex items-center gap-2 px-1 text-xs text-white/40">
          <Bell size={14} /> Preferences save automatically to this device.
        </p>
      </div>
    </main>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 text-left hover:bg-white/10"
    >
      <div>
        <p className="font-medium text-white/90">{label}</p>
        {desc && <p className="text-xs text-white/50">{desc}</p>}
      </div>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          value ? "bg-violet-400" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
