## Problem

After login, every user briefly sees the WSP Operations screen (`/`) for ~2–3 seconds before being redirected to their actual landing page (`/my-wds` for WD Admins, `/tl` for TLs). This causes confusion.

## Root cause

`src/components/AppShell.tsx` already redirects non-WSP users away from `/`, but the redirect happens in a `useEffect` that runs **after** the first render. That first render shows the WSP cards (`WspOperationsPage`) until React commits the navigation. The existing `showLoadingOverlay` only hides children while `authLoading || rolesLoading` is true — it does not cover the gap between "roles finished loading" and "redirect navigation committed".

A second contributor: any time roles load and the current route doesn't match the user's role (not just `/`), the page content flashes before `AppShell` redirects.

## Fix (single file: `src/components/AppShell.tsx`)

1. Compute a `pendingRedirect` flag right next to the existing redirect `useEffect`, using the same logic:
   - `true` if `location.pathname === "/"` and the user is not WSP/WSP admin/admin, OR
   - `true` if the current path matches a `routeRoleMap` entry the user is not allowed in.
2. Extend the loading overlay condition so children are replaced by the spinner while `pendingRedirect` is true (in addition to the existing `authLoading || rolesLoading` case).
3. Leave the redirect `useEffect`, `landingForRoles`, `routeRoleMap`, waiting-screen, and back-home logic unchanged.

Result: TLs and WD Admins see only the header + spinner from the moment they land on `/` until the router commits the redirect — no WSP cards flash.

## Out of scope

- No changes to `src/routes/index.tsx`, role hook, auth hook, or any role-specific landing page.
- No change to the redirect destinations themselves.
- No change to the waiting screen for users with no role/entity assigned.
