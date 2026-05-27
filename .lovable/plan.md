## Plan

Fix the TL linkage as a data-only backfill, without changing permissions, workflows, stock, or history.

## What I found

- The app uses `wd_tls.user_id` for several TL-specific features via `current_user_wd_tl_id()`.
- The account seeding created/ensured TL auth users and `profiles.tl_id`, but it did not create/link matching `wd_tls` rows.
- Current counts:
  - Active hierarchy TLs: 200
  - Linked `wd_tls` rows: 38
  - Missing TL-to-WD links: 162

## Implementation steps

1. Read active rows from `hierarchy_tl` with their `tl_id`, `tl_name`, `wd_code`, and `tl_type`.
2. Match each hierarchy TL to its user through `profiles.tl_id`.
3. Upsert/link `wd_tls` rows so each TL user has:
   - `user_id` = matching TL user
   - `wd_code` = mapped WD from `hierarchy_tl`
   - `tl_name` = hierarchy TL name
   - `tl_type` = hierarchy TL type if available
   - `legacy_tl_id` = numeric TL ID when applicable
4. Preserve existing `wd_tls.id` rows where possible, only filling/updating linkage fields.
5. Verify that all active hierarchy TLs now resolve to a linked `wd_tls` row.
6. Optionally update the existing seed function afterward so future TL seeding also links `wd_tls` automatically.

## Safety boundaries

- No schema changes.
- No RLS or permission changes.
- No hierarchy logic changes.
- No stock/history resets.
- No recreation of existing users.