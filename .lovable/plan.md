## What the sheet contains

165 rows → 16 unique AEs, 100 unique WDs, 165 unique TLs.

All the user-creation, role, hierarchy, mapping, and permission logic already exists. The work is purely a data import.

## Steps

### 1. Insert hierarchy rows (data-only, idempotent)

Use a single `INSERT … ON CONFLICT DO UPDATE` call (via the data tool) that mirrors what the existing `admin_import_hierarchy` RPC does, populating:

- `hierarchy_ae` (16 AEs) — upsert on `ae_id`
- `hierarchy_wd` (100 WDs) — upsert on `wd_code`, sets `ae_id` mapping
- `hierarchy_tl` (165 TLs) — upsert on `tl_id`, sets `wd_code` mapping, `active = true`

All TL IDs (numeric like `33702` and string like `VEC94666`) are cast to text. Existing rows are updated in place — no deletes, no impact on stock/activity/history.

### 2. Seed auth accounts

Auth user creation requires the admin SDK and can't be done from SQL. The existing **"Seed accounts from hierarchy"** button on `/admin/users` already does exactly what's needed — idempotent, skips existing users, creates:

- AEs → `wd_admin` role, login ID = AE ID (e.g. `VI7001`), password `123456`
- TLs → `tl` role, login ID = TL ID (e.g. `33702` or `VEC94666`), password `123456`

After step 1 lands, I'll prompt you to click that button once. It will create the new accounts and leave existing users untouched.

## Out of scope

- No changes to hierarchy / role / permission / workflow code.
- No deletes; no stock/history reset.
- No new UI.