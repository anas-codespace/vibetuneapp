
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
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH scored AS (
    SELECT
      COALESCE(le.artist, '') AS artist,
      CASE
        WHEN le.reason IN ('skipped_early') THEN -1.0
        WHEN le.reason IN ('completed', 'liked') THEN 2.0
        ELSE 1.0
      END * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id AND le.created_at > now() - interval '90 days'
  )
  SELECT COALESCE(jsonb_object_agg(artist, wsum) FILTER (WHERE artist <> ''), '{}'::jsonb)
  INTO v_artists FROM (SELECT artist, SUM(w) AS wsum FROM scored GROUP BY artist) a;

  WITH scored AS (
    SELECT COALESCE(le.language, '') AS language,
      CASE WHEN le.reason IN ('skipped_early') THEN -1.0
           WHEN le.reason IN ('completed', 'liked') THEN 2.0
           ELSE 1.0 END
      * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id AND le.created_at > now() - interval '90 days'
  )
  SELECT COALESCE(jsonb_object_agg(language, wsum) FILTER (WHERE language <> ''), '{}'::jsonb)
  INTO v_languages FROM (SELECT language, SUM(w) AS wsum FROM scored GROUP BY language) l;

  WITH scored AS (
    SELECT COALESCE(le.genre, '') AS genre,
      CASE WHEN le.reason IN ('skipped_early') THEN -1.0
           WHEN le.reason IN ('completed', 'liked') THEN 2.0
           ELSE 1.0 END
      * exp( - EXTRACT(EPOCH FROM (now() - le.created_at)) / (14.0 * 86400.0) ) AS w
    FROM public.listening_events le
    WHERE le.user_id = _user_id AND le.created_at > now() - interval '90 days'
  )
  SELECT COALESCE(jsonb_object_agg(genre, wsum) FILTER (WHERE genre <> ''), '{}'::jsonb)
  INTO v_genres FROM (SELECT genre, SUM(w) AS wsum FROM scored GROUP BY genre) g;

  SELECT LEAST(1.0, GREATEST(0.0,
    COALESCE(COUNT(DISTINCT artist)::REAL / NULLIF(COUNT(*), 0), 0.5)))
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
