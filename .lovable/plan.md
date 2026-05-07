## Issue 1 — Password length

Supabase Auth's default minimum password length is **6 characters**, not 4. Our code allows 4 (`z.string().min(4)`) and defaults to `"1234"`, so account creation may have appeared to succeed in the UI but `auth.admin.createUser` actually rejected the password — leaving the profile/role rows in place but **no auth user**, which is exactly why login `VIJ003` / `1234` returns "Invalid ID or password".

**Fix:**
- Change `DEFAULT_PW` from `"1234"` to `"123456"` in `src/server/admin.functions.ts`.
- Change all `z.string().min(4)` password validators to `.min(6)`.
- Update UI placeholder/help text in `admin.users.tsx` and `wd-admin.users.tsx` from "default 1234" → "default 123456".

## Issue 2 — Seed accounts from your hierarchy sheet

You're right — I should create the accounts from the hierarchy you sent. I'll seed the hierarchy tables AND auto-create auth accounts for every AE and TL in one go, using the data visible in your screenshot.

### Data to seed (from the screenshot)

**AE VIJ003 — Nanaji**
- VI3180 SRI KALYANI AGENCIES → GUNA 32285, HANOK 31070, 3180 ESWAR RAO 3888, PRUDVI 3989
- VI3233 SAI VENKATA NARASIMHA ENTERPRISES → BHANU 31272, GOPI 33715, AMIR 30451
- VI3391 PAVANI ENTERPRISES → SRIKANTH 32629, JAGADESH 31274, JANAKI RAM 31071, MANIKANTA 31776, VINOD 36835
- VI3465 VASUDAH ASSOCIATES → MURALI_VI3232 4515, JOSEPH 31975, PREM 38653, REHMAN_VI3232 33717, HANUMANTH 31963, SANTOSH 37401
- VI3799 PIONEER MARKETING → NIKHIL 36452, SHIVA 31275

**AE VI1005 — Sai Venu**
- VI3221 CMK ASSOCIATES → KAPUGANTI PRASANTH KUMAR 37306, CHAKRAMAHANTI GOWRI SANKAR 35117A, KAKINADA RAVI KUMAR 35329, KOLA TEJESWARARAO 33716, KRISHNA 31271
- VI3434 SREE VAISHNAVI TRADERS → CHAKRAMAHANTI GOWRI SANKAR 35117B, HANUMANSETTI VENKATA NARASIMHA GUPTA 37905, SIVA KUMAR 32108
- VI3500 SURYA MARKETING → BONU JAYANTH 32616, KALLEMPUDI SRINIVASA RAO 4273, KALLEPALLI SRINU 36339, PALIVELA SRINIVASARAO 37644, RAJARAM GARAKIPATI 37220
- VI3801 SRI VENKATA SAI ABHAYA ANJANEYA TRADERS → ADARI VAMSI 35116, KANISETTY SATISH 36840

### How I'll seed it

A single new migration that:
1. Upserts all rows above into `hierarchy_ae`, `hierarchy_wd`, `hierarchy_tl` (idempotent — won't disturb anything else).
2. Adds a SQL helper `admin_seed_accounts_from_hierarchy()` that, for every AE and active TL in the hierarchy without an auth user yet, creates one via `auth.admin` equivalent. Since SQL can't directly create auth users, I'll instead expose a **server function** `seedAccountsFromHierarchy()` (admin-only) that:
   - Iterates `hierarchy_ae` → `createUser(<ae_id>@posm.local, "123456")` + profile + `wd_admin` role.
   - Iterates `hierarchy_tl` → `createUser(<tl_id>@posm.local, "123456")` + profile + `tl` role.
   - Skips any user that already exists (lookup by email).

3. Adds a **"Seed Accounts from Hierarchy"** button on `/admin/users` (Super Admin only) that calls the function and shows a toast with `{ae_created, tl_created, skipped}`.

### Result

After approval and one click, every AE and TL from your sheet can log in immediately with their ID + password `123456`. WD visibility flows automatically from the hierarchy.

### Files touched

- `supabase/migrations/<new>.sql` — seed hierarchy rows.
- `src/server/admin.functions.ts` — bump password validation/default to 6, add `seedAccountsFromHierarchy`.
- `src/routes/admin.users.tsx` — add "Seed Accounts from Hierarchy" button next to Create Account; update default-password text.
- `src/routes/wd-admin.users.tsx` — update default-password text.

Nothing in the existing `profiles`, `user_roles`, stock, or transaction data is modified or removed.
