## Goal

1. Make first paint after login noticeably faster.
2. Stop non-WSP users (TL / WD / WD-admin) from briefly seeing the WSP Operations page on cold load or after sign-in.

## Why it's slow / flashing today

- **Sequential auth bootstrap.** `useAuth` does `getSession` → `loadProfile` (1 query). Only then does `useRoles` start, which itself runs up to **3 sequential queries** (`user_roles`, `hierarchy_wd` or legacy `ae_assignments`, `hierarchy_tl`). Until all of that finishes, `AppShell` shows a spinner. That's typically 4–6 round trips before the app is usable.
- **WSP page fires its own queries during the auth wait.** `src/routes/index.tsx` (`WspOperationsPage`) is the route component for `/`, so even when `AppShell` is showing the loading overlay, the page itself has already executed `useEffectiveWsp`, `useOpenIssuesCount`, and `useLossesSummary` — three more queries + a realtime channel — for users who will be redirected away.
- **WSP-screen flash for TL/WD users.** The redirect logic lives in an `AppShell` `useEffect` that only runs after `rolesLoading` becomes false. There is a render frame between "roles loaded" and "navigate fires" where, in practice, the WSP page chrome (header + Building2 icon + "WSP Operations") becomes visible because content sits inside the route component, not behind the overlay. Symptom matches what the user reports.
- **Big route bundles.** `tl.tsx` (1.2k lines), `wd-issue-tl.tsx` (1.7k), `wd.tsx` (1.2k), `wd-issue.tsx`, `wd-transfer.tsx`, `wd-stock-track.tsx`, `movements.tsx`, `receive.tsx` — all imported eagerly via the generated route tree. First load downloads code for every role.
- **No caching across navigations.** Every page mount re-fetches profile, roles, materials, stock, notifications. No TanStack Query in the app even though the template ships with it.

## Plan

### 1. Fix the WSP flash (highest priority, smallest change)

In `src/routes/index.tsx`:
- Move the WSP-only hooks (`useEffectiveWsp`, `useOpenIssuesCount`, `useLossesSummary`) and the entire WSP UI into a new internal `WspOperationsContent` component.
- The route component becomes a thin gate: read `useAuth` + `useRoles`; while `authLoading || rolesLoading` render `<AppShell>{null}</AppShell>` (the existing overlay handles the spinner); if user is not WSP/WSP-admin/admin, render `<AppShell>{null}</AppShell>` and let `AppShell`'s redirect effect fire — never mount `WspOperationsContent`.
- Tighten `AppShell`: when `pendingRedirect` is true OR the user isn't allowed on the current path, force the overlay regardless of children. This guarantees no role-mismatched content ever paints.

Result: TL/WD users never see WSP chrome or fire WSP queries.

### 2. Parallelize and cache auth bootstrap

- In `useAuth.loadProfile`, fire `profiles` + `user_roles` + (`hierarchy_wd` when `ae_id`) + (`hierarchy_tl` when `tl_id`) in **parallel** via `Promise.all`, and expose roles/aeWds/tlReceiver through context so `useRoles` doesn't have to re-query.
- Refactor `useRoles` to read from that context (keep the same public API) — eliminates the second round of 1-3 queries.
- Adopt TanStack Query (already a transitive dep via the template) for the bootstrap: cache `profile+roles` under a stable key with `staleTime: 5 min` so subsequent navigations don't refetch. If adding `@tanstack/react-query` isn't already wired in, do the minimal QueryClient setup in `__root.tsx`.

Expected: 4–6 sequential round trips collapsed to ~2 parallel ones, and zero refetch on in-app navigation.

### 3. Code-split heavy routes

- Convert the largest route files to lazy split (`tl.lazy.tsx`, `wd-issue-tl.lazy.tsx`, `wd.lazy.tsx`, `wd-issue.lazy.tsx`, `wd-transfer.lazy.tsx`, `wd-stock-track.lazy.tsx`, `movements.lazy.tsx`, `receive.lazy.tsx`, `admin.users.lazy.tsx`). Each becomes a `createFileRoute` shell + `createLazyFileRoute` component file per the TanStack code-splitting rules.
- This drops the initial JS bundle a lot — a TL user no longer downloads WSP / WD / admin code.

### 4. Small cleanups

- Memoize `useEffectiveWsp`'s default-WSP effect so super-admin switching doesn't re-render the tree.
- Throttle the `useOpenIssuesCount` realtime listener: it currently re-runs the count on **any** `stock_movements` change. Filter the `postgres_changes` subscription to `event: 'UPDATE'` (or add a column filter on `item_status`) so dispatch inserts don't trigger unnecessary work.
- In `AppShell`, hide the WSP-related tab calculations behind the role-loaded gate to avoid an extra render with empty `roles`.

## Out of scope

- Visual / UX redesign — no styling changes.
- Backend / RLS changes.
- Touching the auto-generated Supabase client files.

## Verification

- TL login → land directly on `/tl` with no WSP header/icon ever visible.
- Cold load to first interactive < ~1.5 s on a warm cache, vs current ~3–4 s.
- Navigating between pages does not re-show the top spinner (profile/roles cached).
- Network panel: at most 2 parallel auth queries on first load instead of the current 4–6 serial ones.
- Initial JS payload for a TL-only user drops measurably (TL/WD/admin chunks no longer in the entry bundle).
