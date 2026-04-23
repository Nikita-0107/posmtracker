

# Reflect losses in the Excel export

Now that **Accept Loss** permanently deducts stock and we have a Losses view in the app, the exported Excel has gaps:

- The **Dispatch Log** sheet doesn't show whether each dispatch was delivered, is still open as an issue, or was written off as a loss.
- Losses don't appear anywhere — they silently shrink **Current Stock** with no audit trail.
- The **WSP Stock Ledger** treats losses identically to dispatches, so reviewers can't tell a delivery from a write-off on a given day.

This plan adds loss visibility everywhere it belongs.

## Changes to the workbook

### 1. Dispatch Log — new `status` and `closed_at` columns

Pull `item_status`, `issue_note`, `resolved_at` from `stock_movements` for every dispatch row.

| status value | meaning |
|---|---|
| `delivered` | WD confirmed receipt |
| `open_issue` | WSP raised an issue, not yet resolved |
| `closed_resolved` | issue resolved by re-dispatch / correction |
| `closed_loss` | **Accept Loss** — stock written off |
| `pending` | dispatched, no WD action yet |

New columns appended to the Dispatch Log sheet:
- `status`
- `issue_note` (only filled when there is one)
- `closed_at` (= `resolved_at`, formatted)

### 2. New sheet: **Losses**

Dedicated sheet showing every `dispatch` row with `item_status = 'closed_loss'`, sorted by `resolved_at` desc.

Columns:
```text
loss_date | dispatch_date | dispatch_id | wsp | wd_code | wd_name |
material_code | material_name | quantity_lost | issue_note | proof
```

`proof` is a `HYPERLINK("…","View Proof")` reusing the same signed-URL batch already built. A footer row shows **Total units lost** and **Loss events**.

### 3. WSP Stock Ledger — split losses out

Today the ledger has one column `dispatched_to_WD` that lumps deliveries and write-offs together. Replace with two columns so opening + received − dispatched − lost = closing still holds:

```text
date | material_code | material_name |
opening_quantity | received_from_HO |
dispatched_to_WD | lost | closing_quantity
```

The aggregation loop classifies each `dispatch` movement: if `item_status = 'closed_loss'` it goes to `lost`, otherwise to `dispatched_to_WD`. Closing math is unchanged in total (`opening + received − dispatched − lost`), so **Current Stock** still matches the in-app WSP Stock Overview exactly.

### 4. Current Stock — add `total_lost` reference column

Append a `total_lost` column to the Current Stock sheet (cumulative units written off per material, all-time). Leaves `current_stock` calculation untouched — purely informational so a reviewer can spot heavy-loss SKUs at a glance.

## Technical details

**File touched**: `src/lib/export-dispatch.ts` only. No DB changes, no new hooks, no UI changes.

- Extend the `MovementRow` type and the `select(...)` string to include `item_status`, `issue_note`, `resolved_at`.
- Helper `function statusLabel(m): string` maps `item_status` + presence of issue/resolution to one of the 5 labels above (defaults to `pending`).
- Dispatch Log builder: append the 3 new columns + widen `!cols`.
- New `lossRows` array filtered from `dispatches` where `item_status === 'closed_loss'`; build a Losses sheet with hyperlink wiring identical to the existing Dispatch Log proof column. Insert it right after Dispatch Log.
- Ledger loop: bump `DayAgg` to `{ received, dispatched, lost }`. In the classification step, route closed-loss dispatches to `lost`.
- Current Stock builder: while walking `perKeyDay`, also accumulate per-material `lostByMaterial`. Add `total_lost` column.
- `exportDispatchReport()` return value gains `lossRows: number` so the toast in `src/routes/stock.tsx` can read it (toast message updated to: *"Exported N dispatches · M losses · K ledger rows · X materials"*).

**No filename change.** **No breaking change** to existing columns — only additions plus splitting one column into two in the ledger.

