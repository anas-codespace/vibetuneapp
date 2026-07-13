-- 1. listening_events
CREATE TABLE public.listening_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  listened_ms INTEGER NOT NULL DEFAULT 0,
  track_ms INTEGER NOT NULL DEFAULT 0,
  end_reason TEXT NOT NULL DEFAULT 'abandoned'
    CHECK (end_reason IN ('completed','skipped_early','skipped_late','next_pressed','prev_pressed','error','abandoned')),
  source TEXT NOT NULL DEFAULT 'queue'
    CHECK (source IN ('search','feed','queue','mix','playlist','liked','related','unknown')),
  context_lang TEXT,
  hour_local SMALLINT NOT NULL DEFAULT 0 CHECK (hour_local BETWEEN 0 AND 23)
);
CREATE INDEX idx_listening_events_user_started ON public.listening_events(user_id, started_at DESC);
CREATE INDEX idx_listening_events_user_artist ON public.listening_events(user_id, artist);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listening_events TO authenticated;
GRANT ALL ON public.listening_events TO service_role;

ALTER TABLE public.listening_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own listening events"
  ON public.listening_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own listening events"
  ON public.listening_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own listening events"
  ON public.listening_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own listening events"
  ON public.listening_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. search_events
CREATE TABLE public.search_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  language TEXT,
  resulted_in_play BOOLEAN NOT NULL DEFAULT false,
  top_result_youtube_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_events_user_created ON public.search_events(user_id, created_at DESC);
CREATE INDEX idx_search_events_user_norm ON public.search_events(user_id, normalized_query);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_events TO authenticated;
GRANT ALL ON public.search_events TO service_role;

ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own search events"
  ON public.search_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own search events"
  ON public.search_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own search events"
  ON public.search_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own search events"
  ON public.search_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. user_taste_cache
CREATE TABLE public.user_taste_cache (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_taste_cache TO authenticated;
GRANT ALL ON public.user_taste_cache TO service_role;

ALTER TABLE public.user_taste_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own taste cache"
  ON public.user_taste_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own taste cache"
  ON public.user_taste_cache FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own taste cache"
  ON public.user_taste_cache FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own taste cache"
  ON public.user_taste_cache FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_taste_cache_updated_at
  BEFORE UPDATE ON public.user_taste_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();