import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, KeyRound, Mail, Download, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/settings/privacy")({
  head: () => ({
    meta: [
      { title: "Account & Privacy · Vibtune" },
      { name: "description", content: "Manage your account, password, and data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { session, loading, user } = useAuth();
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteMyAccount);

  const [newEmail, setNewEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  const changePassword = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) return toast.error("Failed", { description: error.message });
    setPw("");
    setPw2("");
    toast.success("Password updated");
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) return toast.error("Enter a valid email");
    setBusy("email");
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setBusy(null);
    if (error) return toast.error("Failed", { description: error.message });
    toast.success("Check both inboxes to confirm the change");
    setNewEmail("");
  };

  const exportData = async () => {
    if (!user) return;
    setBusy("export");
    try {
      const [{ data: profile }, { data: history }, { data: playlists }, { data: likes }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("listening_history").select("*").eq("user_id", user.id),
          supabase.from("playlists").select("*").eq("user_id", user.id),
          supabase.from("liked_songs").select("*").eq("user_id", user.id),
        ]);
      const blob = new Blob(
        [JSON.stringify({ profile, history, playlists, likes, exportedAt: new Date().toISOString() }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vibtune-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch (e) {
      toast.error("Export failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (confirmDel !== "DELETE") return toast.error("Type DELETE to confirm");
    setBusy("delete");
    try {
      await deleteFn();
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate({ to: "/login" });
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="relative min-h-screen pb-44 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="mx-auto max-w-md px-4">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/profile" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-white">Account & Privacy</h1>
        </div>

        <Section icon={Mail} title="Email" subtitle={user?.email ?? ""}>
          <div className="flex flex-col gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            />
            <button
              onClick={changeEmail}
              disabled={busy === "email" || !newEmail}
              className="rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy === "email" ? "Sending…" : "Update email"}
            </button>
          </div>
        </Section>

        <Section icon={KeyRound} title="Password">
          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Confirm new password"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            />
            <button
              onClick={changePassword}
              disabled={busy === "pw" || !pw}
              className="rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy === "pw" ? "Saving…" : "Change password"}
            </button>
          </div>
        </Section>

        <Section icon={Download} title="Your data" subtitle="Download a JSON copy of your account data.">
          <button
            onClick={exportData}
            disabled={busy === "export"}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "export" ? "Preparing…" : "Export my data"}
          </button>
        </Section>

        <Section icon={Shield} title="Privacy" subtitle="Your listening data stays on your account and is never sold.">
          <p className="text-xs leading-relaxed text-white/50">
            We use your play history only to improve recommendations. You can clear it any time under
            Playback History.
          </p>
        </Section>

        <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-red-400">
            <Trash2 size={16} />
            <h3 className="text-sm font-bold">Delete account</h3>
          </div>
          <p className="mb-3 text-xs text-white/60">
            This permanently removes your profile, playlists, history, and avatar. This cannot be undone.
          </p>
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="w-full rounded-xl border border-red-500/30 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10"
            >
              Delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                value={confirmDel}
                onChange={(e) => setConfirmDel(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="rounded-xl border border-red-500/30 bg-black/40 px-3 py-2.5 text-sm text-white outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDelete(false);
                    setConfirmDel("");
                  }}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/80"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={busy === "delete" || confirmDel !== "DELETE"}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "delete" ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Shield;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-white/70" />
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {subtitle && <p className="mb-3 text-xs text-white/50">{subtitle}</p>}
      {children}
    </div>
  );
}
