WITH parsed AS (
  SELECT
    'M/' || split_part(substring(o.name from 'material-images/M_(.*)$'), '-', 1) AS code,
    o.name AS path,
    o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'proofs'
    AND o.name LIKE 'material-images/M_%'
),
ranked AS (
  SELECT DISTINCT ON (code) code, path, created_at
  FROM parsed
  ORDER BY code, created_at DESC
)
UPDATE public.materials m
SET image_path = r.path,
    image_updated_at = r.created_at
FROM ranked r
WHERE m.code = r.code;