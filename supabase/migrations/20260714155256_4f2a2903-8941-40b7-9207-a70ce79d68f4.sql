CREATE TABLE IF NOT EXISTS public.youtube_search_cache (
  query TEXT PRIMARY KEY,
  results JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.youtube_search_cache TO service_role;

ALTER TABLE public.youtube_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage YouTube search cache"
ON public.youtube_search_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS youtube_search_cache_cached_at_idx
ON public.youtube_search_cache (cached_at);