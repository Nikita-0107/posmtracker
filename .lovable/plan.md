

# Add a "Losses" view so closed-loss items are visible

Right now when WSP picks **Accept Loss** on an issue, the dispatch line is marked `closed_loss` and stock is permanently deducted — but it disappears from every screen. There's no place to see what was lost, by how much, or when. This plan adds a dedicated Losses view plus a summary tile so losses stay traceable.

## What you'll get

1. **New "Losses" page** at `/losses` listing every dispatch line with `item_status = 'closed_loss'`:
   - Distributor (WD name + code), material code + description, quantity lost
   - Original issue reason (`issue_note`)
   - Date the loss was accepted (`resolved_at`)
   - Who closed it (performed_by / resolved_by display name when available)
   - Filters: by WD, by material, and by date range (last 7 / 30 / 90 days / all)
   - Summary header showing **total quantity lost** and **number of loss events** for the active filter

2. **Home screen tile** (WSP Operations):
   - New "Losses" card under "Issues Raised by WD" with a red-tinted icon
   - Small subtitle showing total loss qty (e.g. "12 units across 4 events")

3. **Losses summary on the WSP Issues page**:
   - Compact strip at the top: "X open issues · Y units lost to date" with a link to `/losses`

4. **Role visibility**:
   - WSP role: sees only their own WSP's losses (RLS already enforces this)
   - Admin: sees all losses across all WSPs, with WSP column visible
   - WD role: not exposed in nav (losses are a WSP-side concern)

## Technical details

- **No DB schema changes.** All data is already in `stock_movements`:
  - `item_status = 'closed_loss'`, `resolved_at`, `resolved_by`, `issue_note`, `qty`, `material_code`, `distributor`, `wsp`
  - Existing RLS ("Users can view movements for their WSP" + admin) already scopes correctly

- **New files**:
  - `src/routes/losses.tsx` — the Losses page (uses `AppShell`, mirrors `wsp-issues.tsx` styling)
  - `src/hooks/use-losses.tsx` — exports `useLosses({ wd?, material?, sinceDays? })` and `useLossesSummary()` (returns `{ totalQty, count }`); uses Supabase realtime on `stock_movements` filtered to `item_status=closed_loss`

- **Edited files**:
  - `src/routes/index.tsx` — add Losses tile to the `operations` array; show summary subtitle via `useLossesSummary`
  - `src/routes/wsp-issues.tsx` — add the small "X units lost to date" link strip
  - `src/components/AppShell.tsx` — no nav change needed (home tile is the entry)

- **Display lookups**:
  - WD name resolved via existing `wdMaster` from `@/lib/posm-data`
  - Material name resolved via existing `useMaterials()`

- **Loss summary card example layout**:
  ```text
  ┌──────────────────────────────────────┐
  │ ⚠  Total Lost (last 30 days)         │
  │ 47 units · 12 events                 │
  └──────────────────────────────────────┘
  ```

- **Performance**: queries use `head: true` for counts and a single ordered fetch (limit 200) for the list with an "Load older" pagination button if needed later.

