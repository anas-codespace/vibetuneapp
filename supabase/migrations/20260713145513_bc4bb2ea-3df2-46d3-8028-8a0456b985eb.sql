REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_taste_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recalculate_taste_profile(uuid) TO authenticated;