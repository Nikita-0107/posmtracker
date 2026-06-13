# POSM Tracker — Technical Documentation

_Last generated: 2026-06-13_

This document captures the architecture, data model, security model, business
workflows and deployment configuration of the POSM Tracker application.

---

## 1. High-Level Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19 + TanStack Start v1 + TanStack Router (file-based) + TanStack Query |
| Build | Vite 7, TypeScript (strict), Tailwind v4 |
| Server runtime | Cloudflare Workers (via @cloudflare/vite-plugin), TanStack `createServerFn` for app logic, `/api/public/*` routes for webhooks/cron |
| Backend (DB / Auth / Storage / Functions) | Lovable Cloud (Supabase) — PostgreSQL 15, GoTrue Auth, Storage, Edge auth middleware |
| Email | Lovable Email gateway (transactional + auth templates) |
| Hosting | Lovable platform — preview at `id-preview--<id>.lovable.app`, production at `posmtracker.lovable.app` |

### Repo layout (key paths)

```
src/
  routes/                 # File-based routes (TanStack)
    __root.tsx
    index.tsx
    login.tsx
    wd-issue.tsx          # WSP → WD dispatch
    receive.tsx           # WSP receive
    wd.tsx                # WD inbox
    wd-issue-tl.tsx       # WD → TL weekly allocation
    wd-stock-track.tsx
    tl.tsx                # TL daily activity
    admin.*.tsx           # Admin pages
    api/public/*          # Webhooks (signature-verified)
    lovable/email/*       # Email queue endpoints
  components/             # Reusable UI (ProofImageUpload, MaterialImagePicker, AdminTabs, etc.)
  hooks/                  # use-auth, use-roles, use-stock, use-wd, use-effective-wsp, ...
  lib/
    *.functions.ts        # createServerFn modules (client-callable)
    *.server.ts           # server-only helpers (never imported from client)
  integrations/supabase/  # Auto-generated client, types, auth middleware
supabase/
  migrations/             # SQL migrations (authoritative schema)
```

---

## 2. Domain Glossary

| Term | Meaning |
|---|---|
| **POSM** | Point-of-Sale Material (the physical items being tracked) |
| **WSP** | Warehouse Service Provider (regional warehouse). Enum: `CEVL`, `CEVJ`, `CEVY` |
| **WD** | Distributor. Identified by `wd_code` |
| **AE** | Area Executive — manages a set of WDs |
| **TL** | Team Leader — works for a WD, takes weekly allocations, records daily usage |
| **TL Receiver** | A TL designated to receive stock on behalf of their WD |
| **Material** | A POSM item identified by `code` (e.g. `M/0102901123`) |
| **Plan / Bulk Dispatch Plan** | A pre-allocated dispatch from WSP → WD, uploaded in bulk by admins |

---

## 3. User Roles & Permission Model

Roles are stored **exclusively** in `public.user_roles` (never on `profiles`).
Defined as enum `public.app_role`.

| Role | Capability |
|---|---|
| `admin` | Super Admin. Full read/write across all WSPs/WDs. Can impersonate WSPs via the WSP switcher. |
| `wsp` | WSP user — receive, dispatch, manage issues for their assigned WSP. |
| `wsp_admin` | WSP team lead — same as `wsp` + can create dispatch plans for own WSP. |
| `wd` | Distributor user — confirm received stock, raise issues, transfer to other WDs. |
| `wd_admin` | AE-level. Manages WD users, views team reports. (Also referred to as **AE** in UI.) |
| `tl` | Team Leader — record daily TL usage. `is_wd_receiver` TLs also receive on behalf of WD. |

### Authorization helpers (security-definer functions)

| Function | Purpose |
|---|---|
| `has_role(uid, role)` | Bypass-safe role check used by every RLS policy. |
| `current_user_wsp()` | Returns the caller's `profile.wsp`. |
| `current_user_wd()` | Returns the caller's `profile.wd_code`. |
| `current_user_ae_wds()` | Returns the WD codes managed by the calling AE. |
| `current_user_tl_wd_code()` / `current_user_tl_is_wd_receiver()` | TL scoping helpers. |
| `is_loss_approver(uid)` | True if `admin` OR row in `loss_approvers`. |
| `user_admin_scope(uid)` | Returns `(wsp_scope, wd_scope)` for `wsp_admin` / `wd_admin`. |

All RLS policies reference these helpers — they MUST NOT be replaced with
direct table lookups (causes recursive-RLS errors).

---

## 4. Database Schema

### 4.1 Enums

| Enum | Values |
|---|---|
| `app_role` | admin, wsp, wd, tl, wsp_admin, wd_admin |
| `wsp_code` | CEVL, CEVJ, CEVY |
| `batch_type` | Launch, Cyclical, SOV, Others |
| `movement_type` | receive, dispatch, tl_issue |
| `dispatch_item_status` | pending, received, issue, closed_loss, resolved, pending_loss_approval |
| `dispatch_plan_status` | pending, executed, cancelled |
| `loss_approval_status` | pending, approved, rejected |
| `concern_reason` | shortage, damage, other |
| `concern_status` | pending, approved, rejected |
| `tl_alloc_status` | open, closed |
| `wd_transfer_status` | pending, completed, cancelled |
| `wd_transfer_item_status` | pending, received, partial, issue |

### 4.2 Tables (grouped by domain)

> Every table has `id uuid PK` and `created_at timestamptz default now()` unless otherwise noted.
> Columns listed below are domain-specific.

#### Identity / Hierarchy

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.users.id), `mobile`, `display_name`, `wsp`, `wd_code`, `tl_id`, `ae_id`, `tl_type` | Created by `handle_new_user()` trigger. **No role column.** |
| `user_roles` | `user_id`, `role` (app_role), unique `(user_id, role)` | Source of truth for permissions. |
| `hierarchy_ae` | `ae_id`, `ae_name`, `section_id` | Master org chart. |
| `hierarchy_wd` | `wd_code`, `wd_name`, `ae_id` | WD ↔ AE assignment. |
| `hierarchy_tl` | `tl_id`, `tl_name`, `wd_code`, `is_wd_receiver`, `active` | WD's TLs. `is_wd_receiver` = receives on behalf of WD. |
| `ae_assignments` | `ae_user_id`, `wd_code` | Maps an AE user → managed WDs. |
| `wd_assignments` | `wd_code`, `wsp` | Which WSP serves which WD. |
| `wd_tls` | `wd_code`, `tl_name`, `user_id`, `is_wd_receiver` | Link table between hierarchy and signed-in TL accounts. |
| `loss_approvers` | `user_id` | Non-admin users granted loss-approval rights. |

#### Catalog & Stock

| Table | Key columns | Notes |
|---|---|---|
| `materials` | `code` (PK), `name`, `image_path`, `image_updated_at` | `image_path` is the WSP-uploaded reference image (separate from proof images). |
| `stock` | `wsp`, `material_code`, `qty`, unique `(wsp, material_code)` | Current WSP-level stock balance. |
| `wd_stock` | `wd_code`, `material_code`, `qty`, unique `(wd_code, material_code)` | Distributor-level stock. |
| `wd_stock_snapshots` | `wd_code`, `material_code`, `snapshot_date`, `qty`, `created_by`, ... | Periodic point-in-time captures. |

#### Movements (single source of truth for in/out)

| Table | Key columns | Notes |
|---|---|---|
| `stock_movements` | `wsp`, `material_code`, `qty`, `movement`, `distributor`, `performed_by`, `proof_image_path`, `dispatch_id`, `dispatch_date`, `item_status`, `received_date`, `batch_type`, `reference_number`, `parent_movement_id`, `corrected_at`, `corrected_by`, `confirmed_at`, `confirmed_by`, `resolved_at`, `resolved_by`, `issue_note` | One row per material line. Dispatches share a `dispatch_id`. Receives share a `receive_id`. |
| `stock_movement_edits` | Mirror columns prefixed `old_/new_`, `edited_by`, `edit_reason`, `new_movement_id` | Audit trail for `request_movement_correction`, `edit_receive_entry`, `edit_dispatch_entry`. |

#### Dispatch Plans (bulk-uploaded by admins)

| Table | Key columns | Notes |
|---|---|---|
| `dispatch_plans` | `plan_code` (auto `PLAN-YYYY-NNN`), `wsp`, `wd_code`, `plan_date`, `status`, `created_by`, `executed_by`, `executed_at`, `dispatch_id`, `cancelled_by`, `cancelled_at` | Plan code generated by `set_dispatch_plan_code()` trigger. |
| `dispatch_plan_items` | `plan_id` FK, `material_code`, `planned_qty`, `actual_qty` | Joins to a `dispatch_plans` row. |

#### Issues / Losses / Concerns

| Table | Key columns | Notes |
|---|---|---|
| `stock_concerns` | `movement_id`, `reason` (concern_reason), `qty`, `status`, `submitted_by`, `decided_by`, `decision_remarks`, ... | WD-side concern raised on a received line. |
| `loss_approvals` | `movement_id`, `wsp`, `distributor`, `material_code`, `qty`, `reason`, `proof_image_path`, `status` (loss_approval_status), `submitted_by`, `decided_by`, `decided_at`, `decision_remarks` | Submitted by WSP when an issue cannot be redispatched. |

#### TL Allocations & Activity

| Table | Key columns | Notes |
|---|---|---|
| `tl_uploads` | `performed_by`, `kind`, `note` | Generic activity log entry. |
| `tl_issuances` / `tl_issuance_items` | `wd_tl_id`, items: `material_code`, `qty_issued`, `qty_used` | One-off issuances to a TL. |
| `tl_usages` | `wd_tl_id`, `material_code`, `qty`, `outlet_name`, ... | Daily usage entries from TL. |
| `tl_returns` | `wd_tl_id`, `material_code`, `qty`, `note` | Returns from TL to WD. |
| `tl_weekly_allocations` | `wd_tl_id`, `wd_code`, `week_start`, `status` (tl_alloc_status), `closed_by`, `closed_at`, `closure_proof_image_path`, `closure_note` | Weekly batch given to TL. |
| `tl_weekly_allocation_items` | `allocation_id`, `material_code`, `qty_allocated`, `qty_used`, `qty_remaining` | Per-material breakdown. |
| `tl_inactivity_reasons` | `wd_tl_id`, `inactive_date`, `reason`, ... | TL self-reported inactivity. |

#### WD-to-WD Transfers

| Table | Key columns | Notes |
|---|---|---|
| `wd_transfers` | `from_wd_code`, `to_wd_code`, `status` (wd_transfer_status), `note`, `created_by` | Header. |
| `wd_transfer_items` | `transfer_id`, `material_code`, `qty_requested`, `qty_received`, `item_status` | Line items. |

#### Other Distributor-side

| Table | Key columns | Notes |
|---|---|---|
| `wd_brand_images` | `wd_code`, `brand`, `image_path`, `uploaded_by`, `uploaded_at`, `no_stock` | Per-WD brand photo grid. |
| `notifications` | `user_id`, `type`, `title`, `body`, `link`, `related_id`, `read_at` | In-app bell notifications. |

#### Email Infrastructure

| Table | Purpose |
|---|---|
| `email_send_log` | Audit of every send. |
| `email_send_state` | Singleton row: rate-limit config and `retry_after_until`. |
| `email_unsubscribe_tokens` | Signed unsubscribe links. |
| `suppressed_emails` | Hard bounces / explicit opt-outs. |

#### Audit

| Table | Purpose |
|---|---|
| `master_data_audit` | Admin-only diff log of master data changes (hierarchy, assignments, ...). |
| `password_reset_audit` | Admin password-reset events. |

### 4.3 Key Foreign Keys

```
profiles.id              -> auth.users.id
user_roles.user_id       -> auth.users.id
dispatch_plan_items.plan_id -> dispatch_plans.id
stock_movements.parent_movement_id -> stock_movements.id (self-ref, for corrections)
loss_approvals.movement_id -> stock_movements.id
stock_concerns.movement_id -> stock_movements.id
tl_*.wd_tl_id            -> wd_tls.id
tl_weekly_allocation_items.allocation_id -> tl_weekly_allocations.id
wd_transfer_items.transfer_id -> wd_transfers.id
ae_assignments.ae_user_id -> auth.users.id
```

### 4.4 Important Triggers

| Trigger | Table | Function |
|---|---|---|
| `on_auth_user_created` | `auth.users` (AFTER INSERT) | `handle_new_user()` — bootstraps a row in `profiles`. **Does not** assign roles. |
| Plan code default | `dispatch_plans` (BEFORE INSERT) | `set_dispatch_plan_code()` — generates `PLAN-YYYY-NNN`. |
| _(removed 12 Jun 2026)_ | `stock_movements` | `set_material_image_from_movement` was dropped so proof images no longer overwrite `materials.image_path`. |

---

## 5. Row-Level Security Model

RLS is **enabled on every table** in `public`. Highlights per domain
(see migrations for exact predicates):

### 5.1 Stock & Movements
- `stock`, `stock_movements`: `wsp = current_user_wsp() OR has_role(uid, 'admin')` for SELECT/INSERT/UPDATE.
- `stock_movements` additional SELECTs:
  - WD can view dispatches where `distributor = current_user_wd()` (gated by `wd_assignments`).
  - AE can view dispatches where `distributor IN current_user_ae_wds()`.
  - TL receivers can view & update dispatches for their WD.

### 5.2 Dispatch Plans
- `dispatch_plans`:
  - SELECT/UPDATE: `wsp = current_user_wsp() OR admin`.
  - INSERT: `created_by = auth.uid()` AND (`admin` OR (`wsp_admin` AND wsp matches)).
- `dispatch_plan_items`: piggybacks on parent plan via EXISTS subquery.

### 5.3 Hierarchy / Master Data
- `hierarchy_*`: authenticated read; admin (or AE within own scope) write.
- `ae_assignments`: admin manage; AE read own.
- `wd_assignments`: admin manage; visibility through `current_user_wd()` filter.

### 5.4 TL Tables
- All TL tables scope to `wd_tls.user_id = auth.uid()` (self), TL's WD admin, or admin.
- `tl_weekly_allocations` close path is gated by `current_user_wd() = wd_code`.

### 5.5 Issues / Losses / Concerns
- `loss_approvals`: submitter or `is_loss_approver(uid)`.
- `stock_concerns`: WD users for own WD, WSP users see concerns for their WSP, admin all.

### 5.6 Email / Audit
- `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`: `service_role` only.
- `master_data_audit`, `password_reset_audit`: admin read-only.

### Required GRANTs
Every public-schema table grants:
- `SELECT, INSERT, UPDATE, DELETE` to `authenticated`
- `ALL` to `service_role`
- `SELECT` to `anon` ONLY on tables that have public-readable policies (rare).

---

## 6. Storage Buckets

| Bucket | Public? | Purpose | Path convention |
|---|---|---|---|
| `proofs` | private | Receive POs, dispatch proofs, loss proofs, **material reference images** | `<WSP>/<userId>/<kind>-<ts>.<ext>` for proofs; `material-images/M_<code>-<ts>.<ext>` for material images |
| `wd-brand-images` | public | Per-WD brand photo wall | `<wd_code>/<brand>/<filename>` |

### Storage RLS (bucket `proofs`)
| Policy | cmd | Predicate |
|---|---|---|
| Users can upload proofs for their WSP | INSERT | `foldername[1] = current_user_wsp()::text` |
| Users can view proofs for their WSP | SELECT | own WSP or admin |
| WD can upload proofs under their wd_code | INSERT | `foldername[1] = current_user_wd()` |
| WD can view proofs under their wd_code | SELECT | own WD or admin |
| Admins can delete proofs | DELETE | admin only |
| Auth insert / read / update material images | INSERT/SELECT/UPDATE | any authenticated user, `foldername[1] = 'material-images'` |

### Storage RLS (bucket `wd-brand-images`)
- AE / TL receiver / Admin can upload + update for their scope.
- Scoped SELECT for AE/TL/WD/admin.

---

## 7. Server-Side Functions (RPCs)

All RPCs are `SECURITY DEFINER` owned by `postgres` (BYPASSRLS), with explicit
authorization checks inside the function body.

### Receive flow
- `receive_material`, `receive_material_with_create`, `receive_materials`
  — Insert into `stock` and `stock_movements` for one or many lines.

### Dispatch flow
- `dispatch_material` (single line) / `dispatch_materials` (multi-line, returns `dispatch_id`)
  — Reserves stock, creates `stock_movements` rows with `item_status='pending'`, notifies WD users.

### Confirmation by WD
- `confirm_dispatch_item(_movement_id, _action, _qty?, _note?)` — WD marks
  each line as received or issue; updates `wd_stock` on receipt.

### Issue resolution
- `resolve_dispatch_issue(_movement_id, _action, _redispatch_qty?, _proof?)` —
  WSP re-dispatches or keeps pending.
- `submit_loss_approval(_movement_id, _reason, _proof?)` → creates row in
  `loss_approvals`; sets line to `pending_loss_approval`.
- `decide_loss_approval(_approval_id, _decision, _remarks?)` — approver
  approves (deducts WSP stock, closes line) or rejects (returns to `issue`).

### Concerns
- `submit_stock_concern`, `resolve_stock_concern`.

### Movement corrections (48h window)
- `request_movement_correction` (qty only).
- `edit_receive_entry`, `edit_dispatch_entry` — full edit with new movement
  row + audit entry in `stock_movement_edits`.

### TL flow
- `create_weekly_tl_allocation`, `close_weekly_tl_allocation`,
  `tl_carry_forward`, `issue_to_tl`, `issue_to_tl_v2`, `return_from_tl`,
  `tl_self_take`, `tl_self_used`, `tl_self_return`, `record_tl_upload`,
  `link_tl_profile`, `list_pending_tl_setups`.

### WD operations
- `create_wd_transfer`, `confirm_wd_transfer_item`, `record_wd_stock_snapshot`.

### Reporting (read-only, security-definer)
- `get_tl_activity_report`, `get_ae_tl_team_report`, `get_tl_streak`.

### Admin
- `admin_assign_role`, `admin_toggle_super_admin`, `admin_assign_wd_to_tl`,
  `admin_import_hierarchy`, `admin_import_wd_stock`, `list_manageable_users`,
  `user_admin_scope`.

### Email queue
- `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`.

---

## 8. Application Workflows

### 8.1 Receive (WSP)
1. WSP user → `/receive`.
2. Uploads PO image to `proofs/<WSP>/<uid>/receive-*.jpg`.
3. Fills PO number, batch type, receive date.
4. For each line picks/creates material + qty.
5. Submit → `receive_materials` RPC → stock +qty, `stock_movements` rows with `movement='receive'`.

### 8.2 Dispatch (WSP → WD)
1. WSP user → `/wd-issue`. May be entered with `?planId=<uuid>` for a bulk plan.
2. Selects WD (or pre-filled by plan).
3. Adds material/qty lines (capped by available stock minus pending).
4. Captures dispatch proof image.
5. Submit → `dispatch_materials` RPC → `stock_movements` rows `item_status='pending'`, shared `dispatch_id`.
6. If executing a plan: `markPlanExecuted()` sets `dispatch_plans.status='executed'` and writes `actual_qty` per item.
7. Notifications inserted for assigned WD users.

### 8.3 Bulk Dispatch Plan Upload (Admin)
1. Admin → `/admin/bulk-dispatch`, uploads `.xlsx` parsed by `parse-dispatch-plan-xlsx.ts`.
2. Validated rows grouped by `(wsp, wd_code)` → one plan per group via `createBulkPlans`.
3. `set_dispatch_plan_code()` trigger assigns `PLAN-YYYY-NNN`.
4. Each WSP user sees their pending plans on `/wd-issue`.
5. Execution tracker at `/admin/bulk-dispatch-tracker` summarises status:
   - **Completed**: every item `actual_qty >= planned_qty`.
   - **In Progress**: at least one item dispatched, not all.
   - **Pending**: none dispatched.

### 8.4 WD Confirms / Raises Issue
1. WD user → `/wd`.
2. Each in-transit line shows confirm / issue buttons → `confirm_dispatch_item`.
3. Received qty added to `wd_stock`. Issues become visible to WSP at `/wsp-issues`.

### 8.5 Issue Resolution (WSP)
1. WSP user → `/wsp-issues`.
2. Choose redispatch (new movement row) / keep pending / submit loss.
3. Loss approval flows through `/loss-approvals` (approver-only).

### 8.6 WD → TL Weekly Allocation
1. WD admin → `/wd-issue-tl` → creates weekly allocation per TL.
2. TL records daily usage on `/tl` (`tl_usages`).
3. Allocation closes (`close_weekly_tl_allocation`) with proof image + remaining qtys carried forward.

### 8.7 WD-to-WD Transfer
1. Source WD user → `/wd-transfer` → `create_wd_transfer`.
2. Destination WD confirms line-by-line via `confirm_wd_transfer_item`.
3. Stock moves between `wd_stock` rows.

### 8.8 Material Image (separate from proof)
- WSP user uploads via Material Image picker → `proofs/material-images/M_<code>-<ts>.<ext>`.
- Recorded on `materials.image_path` (+ `image_updated_at`).
- Displayed everywhere by `MaterialImageViewer` (eye icon, POSM Guide, Admin Images page).
- Proof images NEVER overwrite this (trigger removed June 12, 2026).

---

## 9. Authentication

- **Provider:** Email + password (Supabase Auth). `mobile@posm.local` synthetic email pattern.
- **Sessions:** browser `localStorage` via the standard Supabase client.
- **Server functions** with `requireSupabaseAuth` middleware require a bearer token; `attachSupabaseAuth` (registered in `src/start.ts`) injects it automatically.
- **Protected routes:** all auth-required pages live under `src/routes/_authenticated/` (none currently — gating handled per-route via `useAuth` redirect; revisit during the next layout refactor).
- **`handle_new_user` trigger** creates a `profiles` row on signup; an admin must manually grant roles in `/admin/users`.

---

## 10. Email System

- Templates registered in `src/lib/email-templates/registry.ts`.
- Outgoing flow: `enqueue_email` RPC → queue table → `/lovable/email/queue/process` worker drains in batches honoring `email_send_state.send_delay_ms` / `retry_after_until`.
- Auth emails (signup, password reset, magic link) go through the Lovable Email gateway with templates scaffolded under `src/routes/lovable/email/`.
- Suppression list (`suppressed_emails`) prevents resending to hard-bounced addresses.
- Unsubscribe link served by `/email/unsubscribe`.

---

## 11. Deployment Configuration

### Hosting
- **Runtime:** Cloudflare Workers (Node-compat enabled).
- **Preview URL:** `https://id-preview--7085ebdb-b2fc-40f6-a643-faeaec6fb183.lovable.app`
- **Stable preview URL:** `https://project--7085ebdb-b2fc-40f6-a643-faeaec6fb183-dev.lovable.app`
- **Production URL:** `https://posmtracker.lovable.app`
- **Stable production URL:** `https://project--7085ebdb-b2fc-40f6-a643-faeaec6fb183.lovable.app`

### Build & SSR
- `vite build` → bundled SSR worker (no separate entry-client/entry-server files; TanStack Start plugin handles both).
- `src/start.ts` wires global middleware (`errorMiddleware`, `attachSupabaseAuth`).

### Environment variables
| Scope | Variables |
|---|---|
| Client (Vite-bundled) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |
| Server-only | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Email/webhook secrets | Stored via Lovable secrets manager (not in repo) |

### Migrations
- SQL files in `supabase/migrations/` are the schema source of truth.
- Each migration applies in timestamp order via the Lovable migration tool.
- The Supabase types file (`src/integrations/supabase/types.ts`) is regenerated automatically after each approved migration.

### Public API endpoints (signature-verified)
- `/api/public/*` bypasses Lovable auth on the published site. Used for webhooks and cron callers. Each handler MUST verify HMAC signatures before doing any DB work.

---

## 12. Observability

- **Server logs:** Cloudflare worker logs accessible via Lovable tooling (last hour).
- **Client logs:** in-product console + session replay.
- **DB logs:** Postgres `analytics_query` via Supabase.
- **Auth logs:** GoTrue audit table.

---

## 13. Conventions / Non-Negotiables

1. Never store roles on `profiles`. Use `user_roles` + `has_role()`.
2. Every new `public.` table needs explicit `GRANT`s + RLS + policies in the same migration.
3. Privileged server functions MUST authorize the caller (`requireSupabaseAuth` + role check) — even if no UI calls them, they're public endpoints.
4. `client.server.ts` and any `*.server.ts` helper must NEVER be imported at module scope in client-reachable files. Load via `await import()` inside the handler.
5. Storage policies are folder-based — keep upload paths consistent with the conventions in §6 or the upload will RLS-reject.
6. Proof images and Material Images are SEPARATE concepts — never let one overwrite the other.

---

_End of document._
