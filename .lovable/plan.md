## Bulk Material Receipt Planning

Adds a planned-receipt workflow that runs alongside the existing manual Receive page. Nothing in the current Receive flow changes.

### Database (new migration)

New tables in `public`:

- `receipt_plans` — `id`, `uploaded_by`, `wsp_user_id` (target WSP), `wsp_label`, `status` ('pending' | 'in_progress' | 'completed'), `total_materials`, `received_materials`, `notes`, timestamps.
- `receipt_plan_items` — `id`, `plan_id` (FK), `material_id` (nullable until material is created/matched on upload — we resolve at upload time), `material_code_raw`, `material_description_raw`, `planned_qty`, `received_qty`, `status` ('pending' | 'received'), `proof_image_url`, `material_image_url`, `received_at`, `received_by`.

Both get GRANTs (authenticated + service_role), RLS enabled, `updated_at` triggers.

Policies:
- Admin/super admin: full access.
- WSP: SELECT/UPDATE their own plan + items (`wsp_user_id = auth.uid()`).

Storage: reuse existing proof/material image buckets used by `receive.tsx`.

### Server functions (`src/lib/receipt-plan.functions.ts`)

All `createServerFn` + `requireSupabaseAuth`:

- `uploadReceiptPlan({ wspUserId, rows: [{code, description, qty}] })` — admin only. For each row: look up material by code; if missing, insert into `materials` (code + description). Create plan + items. Returns `{ planId }`.
- `listReceiptPlans({ scope })` — admin sees all; WSP sees own pending/in-progress.
- `getReceiptPlan(planId)` — plan + items + material info (incl. existing material image).
- `submitReceiptPlanItem({ itemId, receivedQty, proofImageUrl, materialImageUrl? })` — WSP confirms one line. Validates proof present. If material has no image and `materialImageUrl` provided, set it on `materials`. Insert a `stock_movements` receipt row (matching what manual Receive does) and bump `wd_stock`/`stock`. Mark item received, recompute plan counters, flip status to `in_progress` / `completed`.
- `getReceiptPlanTracker()` — admin tracker rows.
- `deleteReceiptPlan(planId)` — super admin, only if no items received.

Reuse existing helpers from `receive.tsx` for stock insertion logic — extract the shared receipt write into a small helper if needed.

### Parsing

New `src/lib/parse-receipt-plan-xlsx.ts` modeled on `parse-dispatch-plan-xlsx.ts`. Columns: Material Code, Material Description, Quantity. Validates non-empty code, positive integer qty, dedupes rows by code (sum qty).

### Routes

New files (manual Receive route untouched):

- `src/routes/admin.bulk-receipt.tsx` — upload UI: pick target WSP, drop xlsx, preview parsed rows (highlight which codes are new vs existing), submit. Mirrors `admin.bulk-dispatch.tsx`.
- `src/routes/admin.bulk-receipt-tracker.tsx` — table of plans with columns from spec (Plan ID, Upload Date, WSP, Total, Received, Pending, Status) + drill-in.
- `src/routes/receipt-plans.tsx` — WSP-facing list of their pending plans.
- `src/routes/receipt-plans.$planId.tsx` — per-plan confirmation screen: for each item show planned qty, received-qty input, proof upload (required), material image upload (only if material has no image yet), submit-row button. Plan auto-completes when all items received.

### Nav

- `AdminTabs.tsx`: add "Bulk Receipt" and "Receipt Tracker" entries (super admin / admin).
- `AppShell.tsx`: add "Pending Receipts" entry for WSP role pointing to `/receipt-plans`.

### Constraints

- Manual `receive.tsx` is not edited.
- Stock writes go through the same movement type used by manual receive so reports remain consistent.
- Material auto-create only sets `code` + `description`; image stays null until a WSP uploads one during confirmation.
- Status transitions: pending → in_progress (first item received) → completed (all received).

Approve and I'll implement.
