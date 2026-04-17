

## Plan: "Receive Materials" Screen

Build a new mobile-first screen that lets WSP staff search the material catalog, add new materials inline if not found, then enter quantity to add stock — replacing Step 1 of the current dispatch page with a smoother search-driven flow.

### Where it lives

New route: `/receive` (file: `src/routes/receive.tsx`), added to the bottom nav in `AppShell.tsx`. The existing `/` (Stock & Dispatch) page stays intact — this is an additional, focused entry screen for the "Receive Materials" workflow.

### Data layer changes (`src/lib/posm-data.ts`)

- Convert `posmMaterials` from `as const` readonly tuple → mutable typed array so new items can be appended at runtime (prototype: in-memory only).
- Export a small helper `addMaterial(code, name)` that pushes to the array and seeds `initialStock[code] = 0`.

### Screen structure (single column, max-w-md)

**Header**: "Receive Materials" with a small Inbox/PackagePlus icon.

**Step 1 — Search or Add Material**
- Search input with leading magnifier icon, placeholder "Search Material Code or Name".
- Live filter (case-insensitive, matches code or name) renders a result list of tappable cards:
  - **Bold code** (top line, monospace-ish)
  - Smaller muted name (second line)
  - Selected card gets a primary border + check icon.
- Empty-state when query is non-empty and zero matches:
  - "No results found" muted text
  - **+ Add New Material** outline button → expands an inline form (framer-motion height/opacity):
    - Input: Code / ID (auto-uppercased, trimmed)
    - Input: Description
    - **Save Material** button (disabled until both filled)
    - On save: append via `addMaterial`, auto-select it, collapse the form, clear search, show small "✅ Material added" toast/badge that fades after 2s.

**Step 2 — Enter Quantity** (only visible once a material is selected)
- Selected material summary chip (code bold + name) with a small "Change" link to clear selection.
- Number input with Hash icon, `inputMode="numeric"`, min 1.
- Date field auto-filled with today's ISO date (read-only display using Calendar icon, but editable input type="date" for flexibility).

**Step 3 — Submit**
- Full-width primary button: **Add to WSP Stock** (disabled until material + qty>0).
- On click: increment stock in local state, show success card:
  - ✅ Added to WSP Stock
  - Material Code / Name / Quantity / New Stock Total
- Auto-reset form after ~3s.

### Navigation update

`AppShell.tsx` bottom nav currently has 3 tabs (Dispatch / Issue / Upload). Add a 4th "Receive" tab (Inbox icon) pointing to `/receive`, placed first. Adjust grid to `grid-cols-4`.

### Styling

Reuse existing `selectClass`/`inputClass` patterns from `index.tsx` for consistency: rounded-xl cards, border, bg-card, primary accent on selection, success/10 background for confirmations. Framer-motion AnimatePresence for the inline add-form expand and the success card.

### Files touched

```text
src/routes/receive.tsx          NEW   main screen
src/lib/posm-data.ts            EDIT  mutable array + addMaterial helper
src/components/AppShell.tsx     EDIT  add 4th nav tab, grid-cols-4
```

`routeTree.gen.ts` regenerates automatically — not edited manually.

### Out of scope (prototype constraints)

- No backend persistence — newly added materials live only in-memory and reset on reload (consistent with the rest of the prototype).
- No duplicate-code validation beyond a simple "already exists" check before saving.

