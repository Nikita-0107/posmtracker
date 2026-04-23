

# Clean "Pending approval" experience for new signups

Right now every new signup is auto-assigned the `wsp` role by the `handle_new_user` trigger, but no WSP code is set on their profile — so they land on the misleading **"Waiting for WSP assignment"** screen even though we don't actually know what role they should have.

This plan removes the auto-role assignment and shows a proper **Pending Admin Approval** page instead.

## What changes

### 1. New signups no longer get a role automatically
- Migration: update `public.handle_new_user()` to **only** create the profile row (mobile + display_name). It will **not** insert into `user_roles` anymore.
- Existing users are untouched.

### 2. New "Pending Approval" screen replaces the current "Waiting for…" alert
The `WaitingScreen` in `src/components/AppShell.tsx` becomes a polished page:

```text
┌────────────────────────────────────────────┐
│         🕒  Account Pending Approval       │
│                                            │
│  Hi {display_name},                        │
│  Your account (+91 9876543210) was created │
│  successfully and is awaiting admin review.│
│                                            │
│  An admin will assign your role            │
│  (WSP / WD / TL) and the entity you belong │
│  to. You'll get access as soon as that's   │
│  done — usually within a few hours.        │
│                                            │
│  [ Refresh status ]   [ Sign out ]         │
│                                            │
│  Need help? Contact your admin.            │
└────────────────────────────────────────────┘
```

- Centered card, neutral colors (not destructive red — pending isn't an error).
- **Refresh status** button calls `refreshProfile()` + re-fetches roles so the moment an admin assigns them, one tap unlocks the app.
- **Sign out** button so they can leave cleanly.
- Shows their mobile (with +91 prefix) and display_name so the admin can match them.

### 3. Login page copy update
- After signup the success toast becomes:
  *"Account created! Sign in. An admin will review and assign your role shortly."*
  (removes the WSP-specific wording)

### 4. Bottom nav hidden while pending
- Currently the WSP tab still shows at the bottom because the user has the `wsp` role. After the migration, users with no roles see no tabs (already handled by `tabsToRender.length > 0` check) — so the nav cleanly disappears on the pending screen.

### 5. Admin Users page: highlight pending users
- In `src/routes/admin.users.tsx`, sort users with no role to the top and tag them with a **"Pending"** chip so admins immediately see who needs assignment. (Small UX touch — same page, no new route.)

## Technical details

**Files changed**
- `supabase/migrations/<new>.sql` — replace `handle_new_user()` to drop the `insert into user_roles` block. Add a comment explaining roles are admin-assigned.
- `src/components/AppShell.tsx` — replace `WaitingScreen` body with the new pending card. Add `refreshProfile` from `useAuth` + manual roles re-fetch (lift roles refresh into `useRoles` as a returned `refresh()` callback).
- `src/hooks/use-roles.tsx` — expose a `refresh()` function so the pending screen can re-check without a full reload.
- `src/routes/login.tsx` — update the post-signup info copy.
- `src/routes/admin.users.tsx` — add "Pending" badge + sort users with zero roles to the top.

**Behavior matrix after change**

| User state | What they see |
|---|---|
| New signup, no role yet | Pending Approval card |
| Role assigned but no entity (e.g. wsp role, no wsp code) | Existing role-specific waiting message ("Waiting for WSP assignment", etc.) — unchanged |
| Role + entity assigned | Normal app |
| Admin | Normal app |

**No data loss**: existing users keep their roles. Only future signups are affected.

