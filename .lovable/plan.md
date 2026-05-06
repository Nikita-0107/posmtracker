
## Goal

Make WD stock a shared pool consumed by TLs (self-serve) and AEs (on-behalf), introduce AE → multiple WDs scope, and keep the login flow + inactivity logic intact. All existing data stays.

---

## 1. Roles & login

- Keep the single mobile+password login. No separate flows.
- Roles: `super_admin`, `wsp_admin`, `wd_admin` (AE), `tl` (already partly in place from previous migrations).
- After login, route by role:
  - super_admin → existing admin landing
  - wsp_admin → WSP screens scoped to assigned WSP(s)
  - wd_admin (AE) → WD screens scoped to all WDs in `ae_assignments`
  - tl → simplified TL screen
  - no role / no assignment → land on `/` with a prominent **"Account under setup. Please contact admin."** banner; nav hidden.

## 2. New scope table

- `ae_assignments(id, ae_user_id uuid, wd_code text, created_at)` with unique `(ae_user_id, wd_code)`.
- Helper: `current_user_ae_wds()` returns `text[]` of WD codes the AE manages.
- `wd_admin` profile no longer needs a single `wd_code`; scope comes from `ae_assignments`. Existing `profiles.wd_code` stays for legacy WD/TL users (backward compatible).

## 3. RLS updates (additive, non-breaking)

Add OR clauses so AEs see all data for any WD in their `ae_assignments`:
- `wd_stock`, `wd_tls`, `tl_issuances`, `tl_issuance_items`, `tl_returns`, `tl_inactivity_reasons`, `wd_transfers`, `wd_transfer_items`, `stock_movements` (dispatches to those WDs).
- WSP admins keep WSP-scoped access (already in place).

## 4. Shared WD stock pool — TL flow

- TL screen (`/tl`) becomes:
  - Header: assigned WD + WD name.
  - Live **WD stock list** (`wd_stock` filtered by their WD), realtime via Supabase channel so Guna takes 20 → Hanok sees 80 instantly.
  - **Take Stock**: pick material, qty → `tl_self_take` (already exists; keeps history via `tl_issuances`).
  - **Return Stock**: pick material from "my pending", qty → `tl_self_return` (already exists).
  - **My history** tab (own takes/returns only).
  - No proof image required (per answer).
- Removed from TL screen: other TLs, admin tools, edit old entries.

## 5. AE flow (WD Admin)

- AE dashboard lists all WDs in their scope. Picking a WD scopes the existing WD screens (stock, dispatch verification, transfers, history).
- AE can also Take/Return on behalf of any TL in their WDs (uses existing `issue_to_tl_v2` / `return_from_tl`).
- AE manages TLs: add, remove, assign to WD (writes to `wd_tls`, links `user_id` when promoting an existing user to TL).
- New RPC `ae_set_wd_context(_wd_code)` is unnecessary — UI passes selected WD as a query param; RLS already permits via `ae_assignments`.

## 6. Super Admin updates (admin.users page)

- Show 4 sections: Pending Setup · ⭐ Super Admins · 🔵 Admins (WSP/WD) · ⚪ Users (TL/WSP/WD users).
- "Change role" panel: when assigning `wd_admin`, allow multi-select WDs → writes `ae_assignments` rows (replaces existing for that user).
- Existing `admin_assign_role` RPC extended with `_ae_wds text[]` for AE multi-WD assignment.

## 7. TL inactivity (preserve)

- Keep existing `tl_inactivity_reasons` table and 7-day no-activity alert.
- Activity = `tl_issuances` (take) OR `tl_returns` (return) by that TL in last 7 days.
- AE sees inactivity badge per TL on AE dashboard; can mark reason ("On Leave"/"No requirement") with optional date.

## 8. Backward compatibility

- No drop/rename of existing tables, columns, or rows.
- Existing TLs who use `wd_tls.user_id` linkage continue to work.
- Old `wsp`/`wd` role values stay valid; UI maps them as "User" tier; admins can upgrade specific people to `wsp_admin` / `wd_admin`.
- Existing dispatch / transfer / concerns flows untouched.

---

## Technical summary

**DB migration**
- Create `ae_assignments` + RLS (super_admin manage; AE select own).
- `current_user_ae_wds()` SECURITY DEFINER.
- Update RLS on WD-scoped tables to OR-in `wd_code = ANY(current_user_ae_wds())`.
- Update `admin_assign_role` to accept `_ae_wds text[]` and rewrite assignments atomically.
- Update `list_manageable_users` to include AE WD list per row.
- Enable realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.wd_stock;` (and `tl_issuances`, `tl_returns` for "my history").

**Frontend**
- `src/hooks/use-roles.tsx`: add `isSuperAdmin`, `isWspAdmin`, `isAe`, `isTl`; expose `aeWds`.
- `src/routes/__root.tsx` / `AppShell`: pending-user banner; role-based nav.
- `src/routes/tl.tsx`: rewrite as simple Take/Return + live WD stock + my history. Subscribe to `wd_stock` realtime channel.
- New `src/routes/ae.tsx` (AE dashboard with WD picker + TL list + inactivity badges).
- `src/routes/admin.users.tsx`: AE multi-WD selector; section labels.
- Keep existing WSP/WD/TL routes; gate via role guard reading `useRoles`.

**No removals.** All existing screens remain accessible to legacy users.
