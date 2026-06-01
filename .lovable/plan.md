# Loss Approval Workflow

## Scope (from your answers)
- Only loss path affected: WSP confirming a WD-reported dispatch issue as a loss (`resolve_dispatch_issue` → `accept_loss`).
- Approvers: Super Admin role + 3 hardcoded emails (Satyadeo, UmaMaheswari, Nikita).
- Email via Lovable's built-in email (requires a one-time sender-domain DNS setup at the end).
- Everything else (dispatch, receive, transfer, hierarchy, reports, stock RPCs) untouched.

## Stock behavior (clarifying the spec against current reality)
Dispatch already deducts WSP stock when the dispatch is created. A "loss" today just **locks in** that deduction (sets `item_status='closed_loss'`). Accept-as-loss does not move stock again; reject/redispatch is what re-credits stock.

So "don't impact stock until approved" maps cleanly to: **don't close the line as `closed_loss` until approved**. While pending, the line sits in a new `pending_loss_approval` state — neither closed nor re-credited. On approve → close as loss (current behavior). On reject → line returns to `issue` state so the WSP can choose redispatch instead.

No existing stock RPC is modified.

## Database changes (one migration)
- Add `'pending_loss_approval'` to the `item_status` enum.
- New table `loss_approvals`:
  - `id`, `movement_id` (FK to stock_movements), `wsp`, `material_code`, `qty`, `distributor`
  - `submitted_by`, `submitted_by_role`, `submitted_at`, `reason`, `proof_image_path`
  - `status` enum (`pending` / `approved` / `rejected`)
  - `decided_by`, `decided_at`, `decision_remarks`
- RLS:
  - WSP submitter sees their own rows.
  - Approvers (super admin OR profile email in the 3 hardcoded approvers) see/update all.
- New RPCs:
  - `submit_loss_approval(_movement_id, _reason, _proof_image_path)` — sets movement to `pending_loss_approval`, inserts loss_approvals row.
  - `decide_loss_approval(_approval_id, _decision, _remarks)` — on approve, calls existing close-as-loss path; on reject, flips movement back to `issue`. Sends in-app notification to submitter.
- Grants + RLS following project conventions.

## Frontend changes
- `src/routes/wsp-issues.tsx`: replace direct `accept_loss` call with a modal that requires a reason and (mandatory) proof image upload, then calls `submit_loss_approval`. Show a "Pending approval" pill on lines awaiting decision; disable further actions on those.
- New route `src/routes/loss-approvals.tsx`: queue with Pending / Approved / Rejected tabs, full submission detail + proof image, Approve / Reject buttons with optional remarks. Visible only to approvers.
- New nav entry on `AppShell` for approvers (role check + email check).
- `src/routes/losses.tsx`: only show `approved` losses (current behavior preserved; pending/rejected excluded).
- In-app notification to submitter on approve/reject (existing `notifications` table).

## Email notification
- Transactional email template `loss-approval-required` (sent to all 3 approvers on submission).
- Triggered from `submit_loss_approval` via a small server function that loops the 3 hardcoded recipients (per-recipient send, idempotency key = `loss-approve-<id>-<email>`).
- Subject: "Loss Approval Required – POSM Tracker"; body includes user name, role, WSP, WD, material, qty, reason, submitted-at.

## Audit trail
The `loss_approvals` row itself is the audit record (submitted by/on, decided by/on, remarks). Append-only — no UPDATE policy after a decision is recorded.

## Out of scope (explicitly unchanged)
- `dispatch_materials`, `receive_materials`, transfer/return RPCs.
- WD dispatch/issue UI, TL workflows, AE/TL/admin hierarchy.
- Existing `losses.tsx` filters/exports beyond hiding non-approved rows.
- Stock concerns, snapshots, weekly allocations.

## Rollout order
1. You complete the **email sender domain** DNS setup (button at end of this message). Email sending starts working once DNS verifies — the rest of the workflow works immediately and just queues the notification email.
2. I run the DB migration.
3. I wire up the UI, queue, and notifications.
