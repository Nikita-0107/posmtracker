## Problem

Some users (like `9876543210` / Dummy) have **two rows** in `user_roles` — e.g. `wd_admin` AND `tl` — left over from the earlier `wd` → `tl` migration. The admin panel shows only the primary role (WD Admin), but the gating logic in `AppShell` still sees the stray `tl` and forces the "Waiting for assignment" screen.

## Fix

### 1. One-time database cleanup (migration)

For every user with more than one of the mutually-exclusive primary roles (`wsp_admin`, `wd_admin`, `wsp`, `wd`, `tl`), keep only the highest-priority one and delete the rest. Priority:

```text
wsp_admin > wd_admin > wsp > tl > wd
```

This will remove the stray `tl` row from Dummy and any other affected user, immediately unblocking them.

### 2. Prevent it from happening again

Update the `tl_submit_setup` RPC so a TL setup row cannot be created for a user who already holds a higher role (`wsp_admin`, `wd_admin`, `wsp`, `wd`). And keep the existing `admin_assign_role` behavior of wiping all primary roles before inserting the new one (already correct).

### 3. UI safety net

In `AppShell`, when a user has BOTH `wd_admin`/`wsp_admin`/`wsp` AND `tl`, ignore the `tl` role entirely for gating purposes. (Partly done in last edit — extend it so the "Waiting for assignment" screen also ignores the orphan `tl` and uses the elevated role's entity check instead.)

## Result

- Dummy (and anyone similar) lands directly on the WD page.
- Admin Save flow continues to work cleanly.
- Future legacy migrations can't reintroduce duplicates.
