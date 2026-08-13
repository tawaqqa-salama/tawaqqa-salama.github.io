-- Copy-paste ONLY this into Supabase SQL Editor (project ezmdkwgziyencejfevso).
-- Sets design-knowledge bucket limit to 1 GiB (fits PostgreSQL integer).

UPDATE storage.buckets
SET public = false, file_size_limit = 1073741824
WHERE id = 'design-knowledge';

SELECT id, file_size_limit, public
FROM storage.buckets
WHERE id = 'design-knowledge';
