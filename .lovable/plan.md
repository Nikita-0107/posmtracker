## Goal
Let Super Admins permanently delete **any** user account (not only Pending Setup ones), including users who already have a role assigned. No changes to normal app workflows.

## Current state
- `deletePendingUser` (in `src/lib/admin.functions.ts`) only works when the target has **zero rows** in `user_roles`. The UI Delete button in `admin.users.tsx` is shown only inside the "Pending Setup" section.
- Deleting an active user is risky because many tables reference `auth.users(id)` via `created_by`, `user_id`, `tl_user_id`, `approver`, `reset_by`, etc. Some columns are `NOT NULL` (e.g. `stock_movements.created_by`), so a hard delete of the auth user could either fail on FK or wipe historical audit rows if there's a cascade.

## Approach
Add a new server function `deleteUserPermanently` used only by Super Admins. It performs a **safe hard delete**:

1. Authorize: caller must have `admin` role; refuse self-delete.
2. Revoke access first (so the account can't be used mid-delete):
   - Delete all rows from `user_roles` for the target.
3. Unlink identity from operational tables (nullable columns only — history preserved):
   - `wd_tls.user_id = null`
   - `hierarchy_ae.user_id = null` and `hierarchy_tl.user_id = null` (if such columns exist — verified during build)
   - Any other nullable `*_user_id` link tables (`ae_assignments`, `wd_assignments`, `tl_inactivity_reasons` approver, `loss_approvers`, etc. — enumerated from schema before implementation).
4. Delete `profiles` row for the user.
5. Call `supabase.auth.admin.deleteUser(id)`.
   - If Supabase returns a FK violation (i.e. `created_by`/`reset_by`/etc. still references this user via `NOT NULL` non-cascading FK), surface a clear error: **"Cannot delete: user has historical records (movements, approvals, etc.). Their access has been revoked instead."** The role revocation from step 2 stays, so the account is effectively deactivated even if hard-delete is blocked.
6. Write an audit row into `password_reset_audit` (repurposed) or a new lightweight log — TBD in build step; simplest is reusing `master_data_audit` with an `action='user_deleted'` entry.

The existing `deletePendingUser` stays as-is (no-role fast path) so nothing regresses.

## UI changes (`src/routes/admin.users.tsx`)
- Show a **Delete** button (Trash icon, red) on every row when the viewer is Super Admin — not just in the Pending Setup section.
- Two-step confirm dialog with the user's name + login ID typed to confirm (guards against accidents on active accounts).
- On success: toast + refresh list. On the "historical records" error: toast the friendly message and note that roles were revoked.
- Self-row: button hidden.

## What does **not** change
- No changes to the normal app flows (dispatch, receipts, TL usage, WD, movements, reports).
- No schema/RLS changes needed; only a new server function + UI button.
- `deletePendingUser` untouched.
- All FKs, historical rows, audit trails preserved.

## Technical details for reviewer
- New export in `src/lib/admin.functions.ts`: `deleteUserPermanently` (`createServerFn` + `requireSupabaseAuth`, `assertCallerRole(..., "admin")`).
- Uses `supabaseAdmin` (service role) loaded inside the handler.
- Zod input: `{ target_user_id: uuid, confirm_login_id: string }` — server double-checks the typed login ID matches `profiles.mobile` to prevent misclicks.
- No new migration required in the default path. If we later decide to allow hard-delete despite historical rows, that would need FK `ON DELETE SET NULL` migrations on the referring columns — flagged as follow-up, not part of this change.

## Deliverables
1. `src/lib/admin.functions.ts` — add `deleteUserPermanently`.
2. `src/routes/admin.users.tsx` — Super-Admin-only Delete button on every row, with typed-confirm dialog and error handling.

No other files touched.