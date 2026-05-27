## Why "— no WD —" shows up

The admin Users page reads `profiles.wd_code` (via the `list_manageable_users` RPC) to render each user's WD. The recently-seeded TL accounts have their WD linkage on the `wd_tls` table (which is what the runtime RLS helpers actually use), but `profiles.wd_code` was left `NULL` — so the admin UI thinks they have no WD.

Verified: every TL user shown as "— no WD —" has a populated `wd_tls.wd_code`.

## Fix

Backfill `profiles.wd_code` for all TL users from their `wd_tls` row. One SQL update, no app code, no schema or RLS changes:

```sql
UPDATE profiles p
SET wd_code = t.wd_code, updated_at = now()
FROM wd_tls t
WHERE t.user_id = p.id
  AND p.wd_code IS NULL
  AND t.wd_code IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'tl');
```

Then verify zero TLs remain with `profile.wd_code IS NULL` while having a `wd_tls.wd_code`.

## Out of scope
- No changes to RLS, hierarchy, seeding logic, or the admin RPC.
- AE/WD-admin rows are untouched.
