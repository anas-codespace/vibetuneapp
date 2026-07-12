import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Camera,
  ChevronRight,
  History,
  LogOut,
  Music2,
  Pencil,
  Shield,
  Sliders,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import {
  getListeningStats,
  updateProfileDetails,
  updateProfilePic,
} from "@/lib/library.functions";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile · Vibtune" },
      { name: "description", content: "Manage your Vibtune profile: display name, bio, avatar, and account settings." },
      { property: "og:title", content: "Profile · Vibtune" },
      { property: "og:description", content: "Your Vibtune profile and account settings." },
      { property: "og:url", content: "https://vibetuneapp.lovable.app/profile" },
      { property: "og:type", content: "profile" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://vibetuneapp.lovable.app/profile" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const statsFn = useServerFn(getListeningStats);
  const saveFn = useServerFn(updateProfileDetails);
  const picFn = useServerFn(updateProfilePic);
  const deleteFn = useServerFn(deleteMyAccount);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  const avatarRef = profile?.profile_pic_url ?? null;
  const { data: signedAvatar } = useQuery({
    queryKey: ["avatar-signed", avatarRef],
    queryFn: async () => {
      if (!avatarRef) return null;
      if (/^https?:\/\//.test(avatarRef)) return avatarRef; // legacy full URL
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarRef, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!avatarRef,
    staleTime: 55 * 60 * 1000,
  });

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name);
    if (typeof (profile as { bio?: string } | null)?.bio === "string") {
      setBio((profile as { bio?: string }).bio ?? "");
    }
  }, [profile?.display_name, (profile as { bio?: string } | null)?.bio]);

  const handleSign = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const handleDelete = async () => {
    const typed = deleteConfirmText.trim();
    const expected = user?.email ?? "";
    const matches =
      typed === "DELETE" ||
      (expected && typed.toLowerCase() === expected.toLowerCase());
    if (!matches) {
      toast.error("Please type DELETE or your email to confirm");
      return;
    }
    setDeleting(true);
    try {
      await deleteFn();
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate({ to: "/" });
    } catch (e) {
      toast.error("Couldn't delete account", {
        description: e instanceof Error ? e.message : "",
      });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };



  const handlePic = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large", { description: "Max 5MB" });
      return;
    }
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
      await picFn({ data: { url: path } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["avatar-signed"] });
      toast.success("Avatar updated");
    } catch (e) {
      setLocalAvatar(null);
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) return toast.error("Name can't be empty");
    setSaving(true);
    try {
      await saveFn({ data: { name: name.trim(), bio: bio.trim() } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setName(profile?.display_name ?? "");
    setBio((profile as { bio?: string } | null)?.bio ?? "");
    setEditing(false);
  };

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Vibtune";

  const menu: { key: string; label: string; icon: typeof Sliders; to?: string }[] = [
    { key: "spotify", label: "Connect Spotify", icon: Music2, to: "/settings/spotify" },
    { key: "audio", label: "Audio Quality & EQ", icon: Sliders, to: "/settings/audio" },
    { key: "history", label: "Playback History", icon: History, to: "/settings/history" },
    { key: "notifications", label: "Notifications", icon: Bell, to: "/settings/notifications" },
    { key: "privacy", label: "Account & Privacy", icon: Shield, to: "/settings/privacy" },
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
              {localAvatar || signedAvatar ? (
                <img
                  src={localAvatar ?? signedAvatar ?? ""}
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

          {/* Name & Bio */}
          <div className="mt-4 flex w-full flex-col items-center gap-2 px-2">
            {editing ? (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Display name"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-lg font-bold text-white outline-none focus:border-white/30"
                />
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  placeholder="Add a short bio…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white outline-none focus:border-white/30"
                />
                <div className="flex w-full items-center justify-between px-1">
                  <span className="text-[10px] text-white/40">{bio.length}/280</span>
                  <div className="flex gap-2">
                    <button
                      onClick={cancelEdit}
                      className="rounded-full px-3 py-1 text-xs font-semibold text-white/60 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="rounded-full bg-white px-4 py-1 text-xs font-bold text-black disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-white">{displayName}</p>
                  <button
                    onClick={() => setEditing(true)}
                    aria-label="Edit profile"
                    className="text-white/40 hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {bio ? (
                  <p className="max-w-xs whitespace-pre-wrap text-center text-sm leading-snug text-white/70">
                    {bio}
                  </p>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                    + Add a bio
                  </button>
                )}
                <p className="text-sm text-white/50">{user?.email}</p>
              </>
            )}
          </div>
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
          {menu.map((item) => {
            const inner = (
              <>
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-white/5 p-2 text-white/70 transition-colors group-hover:bg-fuchsia-500/20 group-hover:text-fuchsia-400">
                    <item.icon size={20} />
                  </div>
                  <span className="font-medium text-white/90">{item.label}</span>
                </div>
                <ChevronRight size={20} className="text-white/20" />
              </>
            );
            const cls =
              "group flex w-full items-center justify-between rounded-xl p-3 transition-colors hover:bg-white/5";
            return item.to ? (
              <Link key={item.key} to={item.to} className={cls}>
                {inner}
              </Link>
            ) : (
              <button
                key={item.key}
                onClick={() => toast.info(`${item.label} — coming soon`)}
                className={cls}
              >
                {inner}
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSign}
          className="mx-4 mt-8 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-xl border border-red-500/20 p-4 font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        {/* Danger Zone */}
        <div className="mx-4 mt-10">
          <h3 className="mb-2 px-2 text-xs font-bold tracking-widest text-red-500/80">
            DANGER ZONE
          </h3>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="mb-3 text-sm text-white/70">
              Permanently delete your account and all associated data. This action
              cannot be undone.
            </p>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 font-semibold text-red-500 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDelete && (() => {
        const expected = user?.email ?? "DELETE";
        const typed = deleteConfirmText.trim();
        const matches = typed === "DELETE" || typed.toLowerCase() === expected.toLowerCase();
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => {
              if (!deleting) {
                setConfirmDelete(false);
                setDeleteConfirmText("");
              }
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-neutral-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-2 text-red-500">
                <Trash2 className="h-5 w-5" />
                <h2 className="text-lg font-bold">Delete Account?</h2>
              </div>
              <p className="mb-4 text-sm text-white/70">
                This will permanently delete your profile, playlists, liked songs,
                listening history, and all other data. This{" "}
                <span className="font-semibold text-white">cannot be undone</span>.
              </p>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs text-white/60">
                  Type <span className="font-mono font-bold text-red-400">DELETE</span>
                  {user?.email ? (
                    <> or your email <span className="font-mono text-white/80">{user.email}</span></>
                  ) : null}{" "}
                  to confirm
                </span>
                <input
                  autoFocus
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deleting}
                  placeholder="DELETE"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none focus:border-red-500/50"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteConfirmText("");
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || !matches}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : "Delete Forever"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
