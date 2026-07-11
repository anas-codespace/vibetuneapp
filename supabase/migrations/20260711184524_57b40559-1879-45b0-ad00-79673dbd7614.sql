
CREATE TABLE public.spotify_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  spotify_user_id text,
  spotify_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spotify_tokens TO authenticated;
GRANT ALL ON public.spotify_tokens TO service_role;

ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own spotify tokens" ON public.spotify_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own spotify tokens" ON public.spotify_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own spotify tokens" ON public.spotify_tokens
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own spotify tokens" ON public.spotify_tokens
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_spotify_tokens_updated_at
  BEFORE UPDATE ON public.spotify_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
