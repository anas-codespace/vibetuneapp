
-- user_taste_profile
CREATE TABLE public.user_taste_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  genres JSONB NOT NULL DEFAULT '{}'::jsonb,
  artists JSONB NOT NULL DEFAULT '{}'::jsonb,
  languages JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovery_openness REAL NOT NULL DEFAULT 0.5,
  recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_taste_profile TO authenticated;
GRANT ALL ON public.user_taste_profile TO service_role;
ALTER TABLE public.user_taste_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own taste profile" ON public.user_taste_profile
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_utp_updated BEFORE UPDATE ON public.user_taste_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- feed_cache
CREATE TABLE public.feed_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '4 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, section)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_cache TO authenticated;
GRANT ALL ON public.feed_cache TO service_role;
ALTER TABLE public.feed_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feed cache" ON public.feed_cache
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_feed_cache_user_section ON public.feed_cache(user_id, section);
CREATE TRIGGER trg_fc_updated BEFORE UPDATE ON public.feed_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- feed_errors (server-only reads)
CREATE TABLE public.feed_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.feed_errors TO authenticated;
GRANT ALL ON public.feed_errors TO service_role;
ALTER TABLE public.feed_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can log own feed errors" ON public.feed_errors
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Recalculate taste profile from listening_events using exponential decay
CREATE OR REPLACE FUNCTION public.recalculate_taste_profile(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artists JSONB := '{}'::jsonb;
  v_languages JSONB := '{}'::jsonb;
  v_genres JSONB := '{}'::jsonb;
  v_openness REAL := 0.5;
BEGIN
  -- Aggregate weighted signals with decay e^(-days_ago/14)
  WITH scored AS (
    SELECT
      COALESCE(le.artist, '') AS artist,
      COALESCE(le.language, '') AS language,
      COALESCE(le.genre, '') AS genre,
      CASE
        WHEN le.reason IN ('skipped_early') THEN -1.0
        WHEN le.reason IN ('completed', 'liked') THEN 2.0
        ELSE 1.0
      END * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id
      AND le.created_at > now() - interval '90 days'
  )
  SELECT
    COALESCE(jsonb_object_agg(artist, wsum) FILTER (WHERE artist <> ''), '{}'::jsonb)
  INTO v_artists
  FROM (SELECT artist, SUM(w) AS wsum FROM scored GROUP BY artist) a;

  WITH scored AS (
    SELECT
      COALESCE(le.language, '') AS language,
      CASE
        WHEN le.reason IN ('skipped_early') THEN -1.0
        WHEN le.reason IN ('completed', 'liked') THEN 2.0
        ELSE 1.0
      END * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id
      AND le.created_at > now() - interval '90 days'
  )
  SELECT COALESCE(jsonb_object_agg(language, wsum) FILTER (WHERE language <> ''), '{}'::jsonb)
  INTO v_languages
  FROM (SELECT language, SUM(w) AS wsum FROM scored GROUP BY language) l;

  WITH scored AS (
    SELECT
      COALESCE(le.genre, '') AS genre,
      CASE
        WHEN le.reason IN ('skipped_early') THEN -1.0
        WHEN le.reason IN ('completed', 'liked') THEN 2.0
        ELSE 1.0
      END * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id
      AND le.created_at > now() - interval '90 days'
  )
  SELECT COALESCE(jsonb_object_agg(genre, wsum) FILTER (WHERE genre <> ''), '{}'::jsonb)
  INTO v_genres
  FROM (SELECT genre, SUM(w) AS wsum FROM scored GROUP BY genre) g;

  -- Discovery openness: ratio of unique artists to total plays, bounded 0..1
  SELECT LEAST(1.0, GREATEST(0.0,
    COALESCE(COUNT(DISTINCT artist)::REAL / NULLIF(COUNT(*), 0), 0.5)
  ))
  INTO v_openness
  FROM public.listening_events
  WHERE user_id = _user_id AND created_at > now() - interval '30 days';

  INSERT INTO public.user_taste_profile (user_id, genres, artists, languages, discovery_openness, recomputed_at)
  VALUES (_user_id, v_genres, v_artists, v_languages, v_openness, now())
  ON CONFLICT (user_id) DO UPDATE SET
    genres = EXCLUDED.genres,
    artists = EXCLUDED.artists,
    languages = EXCLUDED.languages,
    discovery_openness = EXCLUDED.discovery_openness,
    recomputed_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_taste_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_taste_profile(UUID) TO authenticated, service_role;
