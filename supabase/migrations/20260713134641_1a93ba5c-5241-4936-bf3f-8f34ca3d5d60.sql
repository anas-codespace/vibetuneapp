CREATE POLICY "Public read access to logo bucket"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'logo');