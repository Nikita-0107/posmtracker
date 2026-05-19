## Goal

Use `WD_Stock_Details.xlsx` as the **current live WD stock** snapshot. Each sheet (e.g. `VI3221`, `VI3500`, …) is one WD. The 8 sheet names exactly match the 8 `wd_code`s in `hierarchy_wd`.

## What the file looks like

Each sheet has:
- Row 2: `WD Code` (numeric, e.g. `3221`)
- Row 5 headers: `Brand | Code | Material Description | SOH`
- Row 6+: data

Across all 8 sheets: **225 stock rows, 83 unique material codes**.

## Mapping rules

- `wd_code` ← **sheet name** (already in `VI####` form, matches DB).
- `material_code` ← `Code` column (e.g. `M/0120201301`).
- `material_name` ← `Material Description`.
- `qty` ← `SOH` (integer).
- Skip rows where `Code` is blank or `SOH` is blank / 0 / non-numeric.
- Trim whitespace on codes/names.

## DB writes (idempotent upserts only — no transactions, no history)

1. **`materials`** — upsert every unique `(code, name)` from the file. `materials.code` is PK, so `ON CONFLICT (code) DO NOTHING` keeps existing names untouched. Required because `wd_stock.material_code` FKs to `materials.code`.
2. **`wd_stock`** — upsert `(wd_code, material_code, qty)` using the existing `UNIQUE (wd_code, material_code)` constraint:
   ```sql
   INSERT INTO wd_stock (wd_code, material_code, qty)
   VALUES (...)
   ON CONFLICT (wd_code, material_code)
   DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();
   ```
   This **overwrites** the current SOH for that (WD, material) pair with the Excel value — which is what "use this as the live stock position" means. Re-running the import produces the same state; no duplicates.

## Explicitly NOT touched

- `stock_movements` — no dispatch/receive rows created.
- `tl_issuances`, `tl_issuance_items`, `tl_returns`, `tl_usages`, `tl_weekly_allocations` — untouched.
- `wd_stock_snapshots` — untouched (this is a different feature: counted snapshots with proof images).
- WSP `stock`, in-transit, brand images — untouched.
- Any (wd_code, material_code) pair already in `wd_stock` but **absent** from the Excel is left alone (not zeroed out). If you want missing rows zeroed, say so and I'll add that step.

## How it's executed

A single SQL migration generated from the file:
- ~83 `INSERT … ON CONFLICT DO NOTHING` rows into `materials`.
- ~225 `INSERT … ON CONFLICT DO UPDATE` rows into `wd_stock`.

No app code changes. After approval the migration runs once; the upserts make it safe to re-run if you upload an updated sheet.

## Files touched

- `supabase/migrations/<new>.sql` — the seed/upsert SQL.

Nothing else.
