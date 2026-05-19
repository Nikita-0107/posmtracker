## Goal
Give TLs a clear, read-only view of the **current WD stock** (WD-SOH) for their WD, so they can plan collections without first opening the Receive flow.

## Current state
- `src/routes/tl.tsx` already fetches `wd_stock` for the TL's `wd_code` (line 141) and subscribes to realtime updates (line 280).
- WD stock is only surfaced as:
  - a count on the "Collect Items from WD SOH" action card ("X materials available at VI…")
  - quantities inside the Receive sheet, mixed with the 40% per-transaction cap UI
- There is no dedicated, searchable list of current WD stock for TLs.

## Proposed change (UI only, no logic/data changes)

1. **New action card on the TL home** (between "Collect Items from WD SOH" and "My SOH"):
   - Title: **"WD Stock (Available at WD)"**
   - Subtitle: `${wdAvailableCount} materials in stock at ${tl.wd_code}` (or "No stock at WD right now")
   - Icon: `Warehouse` in a blue/sky tint to differentiate from green "My SOH"

2. **New `WdStockSheet` screen** opened from that card:
   - Header: "WD Stock — `<wd_code>` · `<wd_name>`" with close button
   - Short helper line: *"Live stock available at your WD. Per-transaction collection limit is 40% of the quantity shown here."*
   - Search box (filter by material code or name)
   - Sort: by qty desc by default; toggle to A–Z by code
   - List rows: material code (mono) + name, right side qty badge
   - Show zero-qty items only when search matches (collapsed by default via a "Show out-of-stock" toggle)
   - Footer summary: total SKUs in stock + sum of units
   - A "Collect from WD" button at the bottom that opens the existing `ReceiveSheet` (no logic change)

3. **No changes** to:
   - 40% per-transaction cap logic
   - Receive / return / used flows
   - `wd_stock` RLS (TLs already have SELECT via `TL can view stock of own WD`)
   - any backend / migration

## Files touched
- `src/routes/tl.tsx` — add new action card, new `WdStockSheet` component, new `screen === "wdstock"` case. All other code unchanged.

## Out of scope
- Editing WD stock from TL side
- History / movement of WD stock
- Brand-wise grouping (can be a follow-up if needed)
