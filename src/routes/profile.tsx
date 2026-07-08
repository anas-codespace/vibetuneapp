import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Clock, LogOut, Music2, Pencil, Headphones } from "lucide-react";
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

  return (
    <main className="relative min-h-screen px-5 pb-44 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-md">
        <h1 className="text-center text-xs font-bold uppercase tracking-[0.25em] text-white/40">
          Profile
        </h1>

        {/* Avatar */}
        <div className="mt-6 flex flex-col items-center">
          <div className="relative">
            <div className="vibe-gradient grid h-28 w-28 place-items-center overflow-hidden rounded-full shadow-[0_0_40px_-8px_rgba(236,0,140,0.7)]">
              {profile?.profile_pic_url ? (
                <img src={profile.profile_pic_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="glass-strong absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full text-white disabled:opacity-50"
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
                  className="glass rounded-full px-3 py-1.5 text-center text-lg font-bold text-white outline-none"
                />
                <button onClick={saveName} className="vibe-text text-sm font-bold">
                  Save
                </button>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-white">{displayName}</p>
                <button onClick={() => setEditing(true)} className="text-white/40 hover:text-white">
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-white/40">{user?.email}</p>
        </div>

        {/* Stats */}
        <section className="mt-8 grid grid-cols-3 gap-3">
          <StatCard label="Minutes" value={stats?.totalMinutes ?? 0} icon={Clock} />
          <StatCard label="Songs" value={stats?.uniqueSongs ?? 0} icon={Music2} />
          <StatCard label="Plays" value={stats?.totalPlays ?? 0} icon={Headphones} />
        </section>

        {/* Sign out */}
        <button
          onClick={handleSign}
          className="glass mt-10 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass gradient-border rounded-2xl p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-white/40" />
      <p className="vibe-text mt-2 text-xl font-bold tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">{label}</p>
    </div>
  );
}
