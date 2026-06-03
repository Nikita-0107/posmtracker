## Goal
Have a single POSM materials surface — the `/posm-guide` page — that shows both the picture/description AND the system codes (e.g. CBOs → `BOXSOL`). Remove the duplicate header "Reference" sheet.

## Changes

1. **`src/routes/posm-guide.tsx`**
   - Extend each item with a `codes: string[]` field (and optional `synonyms` carried over from the old reference).
   - Merge code data from `PosmReferenceGuide`:
     - CBOs → `BOXSOL`
     - Honeycomb → `HCOMB`
     - Fabrics → `FAB`
     - A4 Stickers → `PG_BB_8X11IN`
     - Shelf Highlighters → `SHELF`
     - Brand Boards → `ALT_PP_BB`, `PG_BB`
     - SLU → `SLU`
     - Dummy Packets → `BSS`
     - Danglers → `DANGL`
     - IBB → `IBB`, `IU_ALT_PP`
     - Backing Sheets → `BS`
     - Horizontal Ceiling in Shop → `HORI_CIS`
     - Vertical Ceiling in Shop → `VER_CIS`
   - Also add the two reference-only items missing from the guide so nothing is lost: **Kappa Units** (`KAPPA`) and **Counter Tops** (`CTU`) — using a placeholder/no image (graceful fallback in the card) until pictures are added.
   - Render codes inside each card as monospace chips next to the material name (always visible, not just when expanded).
   - Include codes + synonyms in the search index so users can find a material by typing a code like `BOXSOL` or `HCOMB`.

2. **`src/components/AppShell.tsx`**
   - Remove the `<PosmReferenceGuide compact />` button from the header and the `showRefGuide` block / import.
   - The bottom-nav "Guide" tab (already pointing to `/posm-guide`) becomes the single entry point.

3. **`src/components/PosmReferenceGuide.tsx`**
   - Delete the file (no remaining usages after step 2).

## Out of scope
- No changes to stock/dispatch/receipt logic, hierarchy, search behavior elsewhere, or the bottom-nav structure.
- No new images generated; Kappa Units and Counter Tops will show a neutral placeholder tile until images are provided.
