# In-App Notifications Plan

Yes — this is fully possible. We'll add **real-time in-app notifications** for the two cases you described, using a bell icon in the header (with an unread count badge) plus a toast pop-up when the user is actively in the app.

## What the user will see

**Header (every page):**
A bell icon next to the Admin/Sign-out buttons, with a red badge showing the unread count.

**When something happens:**
- A toast slides in at the bottom of the screen ("New issue from WD-XYZ on dispatch #1234")
- The bell badge increments
- Clicking the bell opens a dropdown listing recent notifications, each linking to the relevant page (e.g. `/wsp-issues` or `/wd`)
- Clicking a notification marks it as read and navigates to the page

## The two trigger cases

| # | Event | Recipient | Where it links |
|---|-------|-----------|----------------|
| 1 | WD marks a dispatch line as "issue" or "partial" (issue portion) | The WSP that owns the dispatch | `/wsp-issues` |
| 2 | WSP creates a dispatch (allocation) for a distributor | The WD that distributor maps to | `/wd` |

## How it works (technical)

### 1. Database
Create a `notifications` table:
- `id`, `user_id` (recipient), `type` (`'wsp_issue'` \| `'wd_allocation'`), `title`, `body`, `link` (e.g. `/wsp-issues`), `related_id` (the `dispatch_id`), `read_at`, `created_at`
- RLS: users can only `SELECT`/`UPDATE` their own rows; inserts only via `SECURITY DEFINER` functions
- Add table to `supabase_realtime` publication so the client gets live pushes

### 2. Backend triggers
Modify the two existing RPC functions to fan out notifications:

- **`dispatch_materials`** → after inserting dispatch lines, look up which WD users own each `distributor` code (via `profiles.wd_code` + `user_roles`) and insert one notification per recipient.
- **`confirm_dispatch_item`** → when `_action = 'issue'` or the partial path produces an issue sibling, look up WSP users for `_row.wsp` and insert a notification for each.

(Both functions already run as `SECURITY DEFINER`, so they can write to `notifications` directly.)

### 3. Frontend
- New hook `useNotifications()` — fetches the latest 20, subscribes to realtime inserts on `notifications` filtered by `user_id`, exposes `unreadCount`, `markRead(id)`, `markAllRead()`
- New `<NotificationBell />` component in `AppShell` header — bell icon, badge, popover dropdown
- On every realtime insert: increment count + show a `sonner` toast with the title
- Clicking a notification: marks it read, navigates to its `link`

### Files touched
- **New SQL migration**: `notifications` table + RLS + realtime + updates to `dispatch_materials` and `confirm_dispatch_item`
- **New**: `src/hooks/use-notifications.tsx`
- **New**: `src/components/NotificationBell.tsx`
- **Edit**: `src/components/AppShell.tsx` (mount the bell)

## Out of scope (for now)
- Email / WhatsApp / SMS notifications (you chose in-app only — easy to add later)
- Browser push notifications when the app is closed (requires service worker setup)
- Notifications for TL flows (only the two cases you asked for)

Approve and I'll implement.