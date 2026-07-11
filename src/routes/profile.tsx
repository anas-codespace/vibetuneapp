import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Camera,
  ChevronRight,
  History,
  LogOut,
  Pencil,
  Shield,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import {
  getListeningStats,
  updateDisplayName,
  updateProfilePic,
} from "@/lib/library.functions";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile · Vibtune" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const statsFn = useServerFn(getListeningStats);
  const nameFn = useServerFn(updateDisplayName);
  const picFn = useServerFn(updateProfilePic);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    enabled: !!session,
  });
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => statsFn(),
    enabled: !!session,
  });

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name);
  }, [profile?.display_name]);

  const handleSign = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const handlePic = async (file: File) => {
    if (!user) return;
    // Instant local preview
    const previewUrl = URL.createObjectURL(file);
    setLocalAvatar(previewUrl);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await picFn({ data: { url: pub.publicUrl } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Avatar updated");
    } catch (e) {
      setLocalAvatar(null);
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setUploading(false);
    }
  };

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await nameFn({ data: { name: name.trim() } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
      toast.success("Name updated");
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : "" });
    }
  };

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Vibtune";

  const menu = [
    { key: "audio", label: "Audio Quality & EQ", icon: Sliders },
    { key: "history", label: "Playback History", icon: History },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "privacy", label: "Data & Privacy", icon: Shield },
  ];

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-xs font-bold uppercase tracking-[0.25em] text-white/40">
          Profile
        </h1>

        {/* Avatar */}
        <div className="mt-8 flex flex-col items-center px-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-white/5 shadow-xl transition hover:opacity-90 disabled:opacity-50"
              aria-label="Change avatar"
            >
              {localAvatar || profile?.profile_pic_url ? (
                <img
                  src={localAvatar ?? profile?.profile_pic_url ?? ""}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl font-black text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/80 text-white backdrop-blur-xl transition hover:bg-black disabled:opacity-50"
              aria-label="Change avatar"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePic(f);
              }}
            />
          </div>

          {/* Name */}
          <div className="mt-4 flex items-center gap-2">
            {editing ? (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center text-lg font-bold text-white outline-none"
                />
                <button onClick={saveName} className="text-sm font-bold text-fuchsia-400">
                  Save
                </button>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-white">{displayName}</p>
                <button onClick={() => setEditing(true)} className="text-white/40 hover:text-white">
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-white/50">{user?.email}</p>
        </div>

        {/* Stats */}
        <div className="mx-4 mt-6 flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
          <StatItem label="MINUTES" value={stats?.totalMinutes ?? 0} withDivider />
          <StatItem label="SONGS" value={stats?.uniqueSongs ?? 0} withDivider />
          <StatItem label="PLAYS" value={stats?.totalPlays ?? 0} />
        </div>

        {/* Menu */}
        <div className="mt-8 flex flex-col gap-2 px-4">
          <h3 className="mb-2 px-2 text-xs font-bold tracking-widest text-white/40">
            ACCOUNT & SETTINGS
          </h3>
          {menu.map((item) => (
            <button
              key={item.key}
              onClick={() => toast.info(`${item.label} — coming soon`)}
              className="group flex w-full items-center justify-between rounded-xl p-3 transition-colors hover:bg-white/5"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-white/5 p-2 text-white/70 transition-colors group-hover:bg-fuchsia-500/20 group-hover:text-fuchsia-400">
                  <item.icon size={20} />
                </div>
                <span className="font-medium text-white/90">{item.label}</span>
              </div>
              <ChevronRight size={20} className="text-white/20" />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSign}
          className="mx-4 mt-8 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-xl border border-red-500/20 p-4 font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </main>
  );
}

function StatItem({
  label,
  value,
  withDivider,
}: {
  label: string;
  value: number;
  withDivider?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center ${
        withDivider ? "border-r border-white/10" : ""
      }`}
    >
      <span className="text-xl font-bold text-white tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="mt-1 text-xs tracking-wider text-white/50">{label}</span>
    </div>
  );
}
