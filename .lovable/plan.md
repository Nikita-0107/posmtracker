## Problem

When a WD Admin (AE) creates a TL account from the user management screen, the new TL signs in and sees **"Not linked to a TL profile"** — even though the TL appears in TL Master (e.g. `VEC94400`).

## Root cause

The TL home page (`src/routes/tl.tsx`, line 116) identifies a TL by looking up a row in `wd_tls` whose `user_id` matches the signed-in user. The "Not linked" banner (line 325) renders when no such row exists.

- The **bulk seeder** in `src/lib/admin.functions.ts` (lines 223–247) correctly finds or inserts a `wd_tls` row and stamps `user_id` after creating the auth user.
- The **single-TL creation path** `createTlAccount` (lines 70–122), which is what the AE/WD-Admin uses, only writes to `hierarchy_tl`, `profiles`, and `user_roles`. It never touches `wd_tls`, so the new auth user has no link to a Team Leader record.

That is why TL Master shows the TL (it reads `hierarchy_tl`) but the TL's own home is unlinked.

## Fix

In `createTlAccount`, after the `user_roles` upsert, apply the same `wd_tls` link logic the bulk seeder uses:

1. Look up an existing `wd_tls` row by `(wd_code, tl_name)`.
2. If found and `user_id` is null → update it with the new `uid`.
3. If found and `user_id` already points to a different user → leave it (or surface a clear error so admin knows the TL name is already taken under that WD).
4. If not found → insert `{ user_id: uid, wd_code, tl_name }`.

No schema change, no migration. Scope limited to `src/lib/admin.functions.ts`.

## Backfill for VEC94400

After the fix is deployed, run a one-time update so the already-created TL (`VEC94400` / "Shyam" under `VI3431`) gets linked:

```sql
UPDATE public.wd_tls
SET user_id = (SELECT id FROM public.profiles WHERE tl_id = 'VEC94400')
WHERE wd_code = 'VI3431' AND tl_name ILIKE 'Shyam' AND user_id IS NULL;
```

(or insert a fresh `wd_tls` row if none exists for that WD+name).

## Files

- `src/lib/admin.functions.ts` — extend `createTlAccount` handler with the wd_tls link block.
- One-off data update for the existing `VEC94400` account.
