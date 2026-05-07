## Phase 1: Restructuring (Login + Hierarchy + Roles + User Management)

This phase touches login, roles, hierarchy, and user management only. **No changes to stock, dispatch, WD stock, TL issuance, or inactivity logic.** All existing data preserved.

---

### 1. Master Hierarchy (new tables)

```text
hierarchy_ae         (ae_id PK, ae_name, section_id)
hierarchy_wd         (wd_code PK, wd_name, ae_id FK)
hierarchy_tl         (tl_id PK, tl_name, wd_code FK, active bool)
```

- `ae_id` and `tl_id` are **strings** (TL IDs include alphanumerics like `35117A`).
- Source of truth for: which WDs an AE owns, which TLs a WD has, which AE manages a TL.
- Helper SQL functions:
  - `ae_wds(ae_id) → text[]`
  - `wd_ae(wd_code) → text`
  - `tl_wd(tl_id) → text`
  - `tl_ae(tl_id) → text`
- Replace `current_user_ae_wds()` to read from hierarchy (fallback to legacy `ae_assignments` so old RLS keeps working during migration).

### 2. Login: unified "ID" field

- Single login page; label changes from **Mobile Number** → **ID**.
- Keep current `<id>@posm.local` email scheme. Accept any string (mobile / AE ID / TL ID).
- WSP users continue to log in with mobile (unchanged).
- AE logs in with `VIJ003`, TL logs in with `32285` (or `35117A`).
- Default password for admin-created accounts: `1234`.
- Add **Change Password** option in the app shell (any logged-in user).

### 3. Roles cleanup

Final roles: `admin` (Super), `wsp_admin`, `wsp`, `wd_admin` (= AE), `tl`.

- Drop **role assignments** of `wd` from `user_roles` (keep enum value to avoid breaking enum dependents; nothing will reference it).
- Keep `profiles.wd_code` and existing RLS using `current_user_wd()` intact (so stock/dispatch keep working).
- Remove the entire **TL setup / pending TL** flow:
  - Delete `TlSetup.tsx` rendering branch in `AppShell`.
  - Drop `tlNeedsSetup` / `tlPendingWd` gating.
  - Keep `wd_tls` table (historical data + stock/issuance FKs), but no longer required for TL login. TL identity comes from hierarchy via `profiles.tl_id` (new column).

### 4. Profile additions

Add to `profiles`:
- `ae_id text` — set for WD Admin users.
- `tl_id text` — set for TL users.

Update `current_user_*` SQL helpers to read from these where applicable.

### 5. WD Admin (AE) experience

- After login, AE lands on new **/my-wds** page listing WDs from `hierarchy_wd WHERE ae_id = current AE`.
- Click a WD → existing WD operations pages, scoped to that WD via a route param or session-selected WD.
- **Auto-migration** (one-time, in the migration that loads hierarchy): for each existing `wd_admin` user with a `wd_code`, look up their AE via hierarchy and set `profiles.ae_id`. Existing `ae_assignments` rows kept as backup.

### 6. TL User experience

- Login with TL ID + password.
- System resolves WD and AE from hierarchy via `profiles.tl_id`.
- No setup screen, no WD assignment, no TL Type selection.

### 7. Super Admin updates

Existing `/admin/users` page kept; add:
- **Hierarchy import** tab: upload CSV (columns: `AE ID, AE Name, WD Code, WD Name, TL Name, TL ID`) → upserts into 3 hierarchy tables. Server function using `supabaseAdmin`. Idempotent.
- **Create AE account**: input AE ID + name → creates auth user `<aeid>@posm.local` with password `1234`, role `wd_admin`, `profiles.ae_id` set.
- **Create TL account**: input TL ID → creates auth user `<tlid>@posm.local` / `1234`, role `tl`, `profiles.tl_id` set. Validates TL ID exists in hierarchy.
- WSP Admin / WSP creation kept as-is.

### 8. WD Admin user management

New simple page **/wd-admin/users**:
- Lists TLs under AE's WDs (from hierarchy).
- **Add TL**: TL ID, TL Name, choose WD (from AE's WDs) → inserts hierarchy_tl row + creates auth user.
- **Remove TL**: sets `hierarchy_tl.active = false` + revokes auth (or removes role). **No deletion of issuances/returns/stock history.**

### 9. Files touched (code, not DB)

- `src/routes/login.tsx` — relabel field.
- `src/components/AppShell.tsx` — remove TL setup gate; route AE → `/my-wds`.
- `src/components/TlSetup.tsx` — delete.
- `src/hooks/use-roles.tsx` — drop `tlNeedsSetup`/`tlPendingWd`; add `aeId`, `tlId`.
- `src/routes/my-wds.tsx` (new), `src/routes/wd-admin.users.tsx` (new).
- `src/routes/admin.users.tsx` — add hierarchy import + AE/TL creation flows; drop manual WD assignment for TLs.
- `src/components/ChangePassword.tsx` (new) + entry in AppShell menu.

### 10. Migration order (single migration file)

1. Create hierarchy tables + RLS (admin manage; AE/TL/WD read own).
2. Add `profiles.ae_id`, `profiles.tl_id`.
3. Update SQL helpers (`current_user_ae_wds`, etc.) to read hierarchy with legacy fallback.
4. Delete `wd` role assignments from `user_roles`.
5. Drop `tl_submit_setup` RPC (no longer used).

Hierarchy data itself is loaded by Super Admin via the new import UI — not seeded in the migration.

---

### Out of scope (later phases)

Stock logic, WSP dispatch, WD stock, TL issuance, inactivity reasons, WD transfers — all untouched.
