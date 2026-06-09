## Goal
Remove the manual "Create Account" UI from the Super Admin → User Management page (`/admin/users`). Account creation will continue to happen exclusively via Hierarchy Import + Seed Accounts. No other behavior changes.

## Scope
Single file: `src/routes/admin.users.tsx`.

## Changes

1. **Remove the render** at line 195:
   - Delete `{scope.is_super && <CreateAccountPanel reload={loadUsers} />}`

2. **Delete the `CreateAccountPanel` component** (starting at line 579) in its entirety, including its AE/TL toggle, AE ID field, AE Name field, WD selector (TL mode), password field, Create button, and any helper text inside it.

3. **Clean up now-unused imports** so the strict build stays green:
   - Remove `UserPlus` from the `lucide-react` import (line 3) — only used inside the deleted panel.
   - Remove `createAeAccount, createTlAccount` from `@/lib/admin.functions` (line 9); keep `resetUserPassword`.
   - Keep `useServerFn` from `@tanstack/react-start` (line 10) — still used by the Reset Password modal.

## Explicitly NOT changed
- Hierarchy import (`admin.hierarchy.tsx`, `importHierarchy`) — untouched.
- Seed Accounts flow (`seedAccountsFromHierarchy`) — untouched.
- `createAeAccount` / `createTlAccount` server functions in `src/lib/admin.functions.ts` remain in place; `createTlAccount` is still used by `/wd-admin/users`. Only the imports into `admin.users.tsx` are removed.
- Password reset (`ResetPasswordModal`, `resetUserPassword`) — untouched.
- User listing, sections (Pending / Needs Update / Super Admins / Admins / Users), edit panel, role assignment, and all RPCs — untouched.
- No DB migration, no changes to existing users or data.

## Verification
- Build passes (no unused imports, no references to removed symbols).
- `/admin/users` renders header, scope chip, helper text, and the user list with no Create Account card above it.
- `/wd-admin/users` still works (TL creation unaffected).
- Password reset button on each Super-Admin-visible row still opens the modal.
