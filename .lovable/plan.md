# WD/AE Export Report — Structure & Usability Upgrade

Scope: only `src/lib/export-wd-report.ts`. No changes to stock, dispatch, issuance, return logic, RLS, or any UI flow. The exporter already pulls live data on each click (`wd_stock`, `tl_issuance_items`, `tl_returns`, `wd_transfer*`), so "live stock" is preserved — we restructure how it's presented.

## 1. Split TL ID and TL Name everywhere

Today `tlLabel()` jams `tl_name + legacy_tl_id + tl_type` into a single `tl` column. Replace with three separate columns wherever a TL appears:

- **TL ID** — `legacy_tl_id` (fallback blank)
- **TL Name** — `tl_name`
- **TL Type** — `tl_type` (kept, but in its own column)

Affected sheets: TL Summary, Allocation Log, Return Log, and the new TL Movement sheet.

## 2. Reorganised sheet list

Final workbook (in this order):

1. **WD Stock Summary** — material-wise live SOH
2. **TL Movement** — TL × material live balance (new)
3. **Allocation Log** — per-issuance line history
4. **Return Log** — per-return line history
5. **Transfer Log** — incoming + outgoing WD transfers
6. **Stock Update History** — physical-count snapshots

"TL Summary" (the per-TL totals sheet) is merged into the new **TL Movement** sheet, which already shows the same numbers split by material — more useful and removes a redundant tab.

### Sheet A — WD Stock Summary
Columns: `Material Code | Material Description | WD SOH | Incoming In Transit | Outgoing In Transit | Available Stock | Last Updated`

- `WD SOH` = current `wd_stock.qty` (live)
- `Incoming In Transit` = sum of pending dispatch lines from WSP to this WD (`stock_movements` where `movement='dispatch'`, `distributor=wd`, `item_status in ('pending','issue')`) — new, but read-only aggregation
- `Outgoing In Transit` = existing pending outgoing transfer logic
- `Available Stock` = `WD SOH − Outgoing In Transit` (unchanged formula)

### Sheet B — TL Movement (new, replaces TL Summary)
One row per (TL, material) with non-zero activity. Columns:

`TL ID | TL Name | TL Type | Material Code | Material Description | Received Qty | Used Qty | Returned Qty | Current TL Balance | Last Activity`

- `Received Qty` = Σ `tl_issuance_items.qty_issued` for that TL+material
- `Used Qty` = Σ `tl_issuance_items.qty_used` for that TL+material
- `Returned Qty` = Σ `tl_returns.qty` for that TL+material
- `Current TL Balance` = `Received − Used − Returned` (matches existing remaining logic; no new business rule)
- `Last Activity` = max(created_at across issuance items, returns) for that pair

Sorted by TL Name, then Material Code.

### Sheet C — Allocation Log
`Date | TL ID | TL Name | TL Type | Material Code | Material Description | Quantity Allocated`

### Sheet D — Return Log
`Date | TL ID | TL Name | TL Type | Material Code | Material Description | Quantity Returned`

### Sheet E — Transfer Log
`Date | Direction (IN/OUT) | From WD | To WD | Material Code | Material Description | Quantity | Status`
(adds explicit Direction column for AE clarity; rest unchanged.)

### Sheet F — Stock Update History
Unchanged columns, just header polish.

## 3. Excel formatting polish

Applied uniformly to every sheet via a small helper:

- **Freeze top row** (`ws['!freeze'] = { ySplit: 1 }` via `XLSX.utils` panes)
- **Bold header row** with light grey fill
- **Title-Case headers** ("Material Code" not "material_code")
- **Numeric columns** right-aligned; qty columns formatted as integers, dates as `yyyy-mm-dd hh:mm`
- **Auto-width** based on max content length (cap 40)
- Empty/`0` numeric cells render as blank for readability

(`xlsx` community build supports header styling via `cellStyles: true` on write; if a style escapes, fall back to bold header only — no blocker.)

## 4. Filename
Keep `WD_{code}_Report_{YYYY-MM-DD}.xlsx`. Unchanged.

## 5. What is explicitly NOT changing
- `wd_stock`, dispatch, issuance, return, transfer SQL — untouched
- No new tables, RPCs, or migrations
- No permission or RLS edits
- The call site in `src/routes/wd.tsx` keeps the same signature
- No reconstruction/derivation of stock from scratch — all numbers come straight from existing live queries

## Technical notes
- Single file touched: `src/lib/export-wd-report.ts`
- `materials` map already loaded → reused for descriptions
- TL Movement aggregation done in-memory from already-fetched `issItems` + `returns` + `tls` — no extra queries
- "Incoming In Transit" adds one extra Supabase query (`stock_movements` filtered by WD + dispatch + pending/issue). Cheap, indexed.
