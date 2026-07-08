CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  profile_pic_url TEXT,
  fav_languages TEXT[] NOT NULL DEFAULT '{}',
  fav_artists JSONB NOT NULL DEFAULT '[]'::jsonb,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INT,
  mood_tag TEXT,
  is_embeddable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT ALL ON public.songs TO service_role;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read songs" ON public.songs FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_songs_mood ON public.songs(mood_tag);
CREATE TRIGGER trg_songs_updated_at BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.listening_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listening_history TO authenticated;
GRANT ALL ON public.listening_history TO service_role;
ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own history" ON public.listening_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own history" ON public.listening_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_history_user_played ON public.listening_history(user_id, played_at DESC);

CREATE TABLE public.liked_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, youtube_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liked_songs TO authenticated;
GRANT ALL ON public.liked_songs TO service_role;
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own likes" ON public.liked_songs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own likes" ON public.liked_songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own likes" ON public.liked_songs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_liked_songs_user ON public.liked_songs(user_id, created_at DESC);

CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  cover_image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own playlists" ON public.playlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own playlists" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own playlists" ON public.playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own playlists" ON public.playlists FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.playlist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, youtube_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_songs TO authenticated;
GRANT ALL ON public.playlist_songs TO service_role;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own playlist songs" ON public.playlist_songs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own playlist songs" ON public.playlist_songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own playlist songs" ON public.playlist_songs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own playlist songs" ON public.playlist_songs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_playlist_songs_playlist ON public.playlist_songs(playlist_id, position);