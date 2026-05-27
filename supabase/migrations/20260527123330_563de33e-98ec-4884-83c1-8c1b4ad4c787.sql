UPDATE profiles p
SET wd_code = t.wd_code, updated_at = now()
FROM wd_tls t
WHERE t.user_id = p.id
  AND p.wd_code IS NULL
  AND t.wd_code IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'tl');