-- Add profile picture to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_pic_url text;

-- Liked songs
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
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own likes" ON public.liked_songs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own likes" ON public.liked_songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own likes" ON public.liked_songs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_liked_songs_user ON public.liked_songs(user_id, created_at DESC);

-- Playlists
CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  cover_image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own playlists" ON public.playlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own playlists" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own playlists" ON public.playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own playlists" ON public.playlists FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Playlist songs (many-to-many with embedded denormalized fields for speed)
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
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own playlist songs" ON public.playlist_songs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own playlist songs" ON public.playlist_songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own playlist songs" ON public.playlist_songs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own playlist songs" ON public.playlist_songs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_playlist_songs_playlist ON public.playlist_songs(playlist_id, position);

-- Avatars storage bucket (public read, owner write)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);