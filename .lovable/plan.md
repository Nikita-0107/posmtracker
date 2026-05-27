## Goal
Run "Seed accounts from hierarchy" on `/admin/users` to create accounts for the AEs and TLs already imported into `hierarchy_ae` / `hierarchy_wd` / `hierarchy_tl`.

## Current blocker
The preview is throwing `Failed to fetch dynamically imported module: virtual:tanstack-start-client-entry`. That's the TanStack Start client entry failing to load — almost always a stale dev server after `src/start.ts` was added in the previous turn. `src/start.ts` itself is correct (registers `attachSupabaseAuth` as a `functionMiddleware`).

## Plan

1. Restart the dev server so the new `src/start.ts` is picked up and the virtual client entry rebuilds.
2. Once the preview loads, click **Seed accounts from hierarchy** on `/admin/users` (already wired with `useServerFn`, so the bearer token will attach).
3. If it still 401s, check server-function logs for `seedAccountsFromHierarchy` and confirm the caller has the `admin` role in `user_roles` (the handler requires it).

## What I will NOT change
- No edits to hierarchy logic, RLS, permissions, or existing users.
- No schema changes — Step 1 (data import) is already done.
- No rebuild of `src/start.ts`, `auth-attacher.ts`, or the admin server functions; they're already correct.
