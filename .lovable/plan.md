## Goal

Add a per-material reference image (linked to the material master, not to transactions) that:
- is captured at WSP receipt time (required),
- is compressed client-side to stay lightweight,
- is viewable on-demand via the existing eye icon on material cards across WSP / WD / TL screens.

No stock, dispatch, permissions, calculations, or reporting logic changes.

---

## 1. Database (single migration)

**Schema**
- Add `materials.image_path TEXT NULL` (storage path inside the `proofs` bucket, e.g. `material-images/VI3180-XXX.webp`).
- Add `materials.image_updated_at TIMESTAMPTZ NULL`.
- Add an UPDATE policy on `public.materials` so any authenticated user can set/replace `image_path` (matches the existing "any authenticated user can insert materials" pattern).

**Storage**
- Reuse the existing private `proofs` bucket under a `material-images/` prefix. No new bucket.
- Add storage RLS:
  - SELECT: any authenticated user can read `proofs/material-images/*` (so signed/public URLs can be fetched on demand).
  - INSERT/UPDATE: any authenticated user can write under `proofs/material-images/*`.
- Images are fetched on demand via `createSignedUrl` (no pre-loading).

---

## 2. Image capture & compression (new helper)

New file: `src/lib/compress-image.ts`
- Pure browser helper. Given a `File`, draw to an offscreen `<canvas>`:
  - max edge 1024 px, preserve aspect,
  - export as `image/webp` quality ~0.78,
  - if result > 150 KB, retry at quality 0.65 then 0.5,
  - fallback to `image/jpeg` if browser lacks webp encode.
- Returns a compressed `File` (≤ ~150 KB target, hard cap 400 KB).

---

## 3. Receipt flow change (REQUIRED image)

File: `src/routes/receive.tsx`
- Each line item gains an optional "Upload Material Image" affordance, but the rule is per **material code** (not per line):
  - If the line's material already has `image_path`, show a small "Image on file ✓ Replace" link (optional re-upload).
  - If the material has no image yet (existing material missing image, OR a brand-new material being added), show a required **"Upload Material Image"** button. Submit is blocked until an image is attached for every such line.
- On submit, for each line that has a staged image:
  1. compress via `compress-image.ts`,
  2. upload to `proofs/material-images/{material_code}-{timestamp}.webp`,
  3. `update materials set image_path=..., image_updated_at=now() where code=...` (for brand-new materials, the existing `receive_materials` RPC creates the material first; we run the update right after the RPC returns).
- Existing receipt RPC, batch type, PO proof image, and stock math are untouched.

UI is reused from a new lightweight `MaterialImagePicker` component (camera/gallery, preview, retake) modeled on `ProofImageUpload` but without uploading until submit (staged in memory so we can compress + upload alongside the receipt).

---

## 4. On-demand viewer

New component: `src/components/MaterialImageViewer.tsx`
- Props: `materialCode`, `hasImage: boolean`, render-prop or default eye-icon trigger.
- Behavior:
  - If `!hasImage`: render the eye icon disabled / faded (`opacity-40 pointer-events-none`).
  - If `hasImage`: clicking opens a simple shadcn `Dialog` (mobile-friendly sheet on small screens). On open, it lazily calls `supabase.storage.from('proofs').createSignedUrl(image_path, 600)` and shows the image (with a small spinner while loading). No metadata, no actions, just the image and a close button.
- Nothing pre-fetches; the signed URL is created only on click and cached in component state for that session.

New small hook: `useMaterialImagePaths(codes: string[])` in `src/hooks/use-stock.tsx`
- Single query: `select code, image_path from materials where code in (...)`.
- Returns `Record<code, image_path | null>`. Lists pass this to the viewer so they know whether to enable the eye icon — they do NOT fetch the image bytes.
- Existing `useMaterials()` is also extended to include `image_path` so screens already loading materials get it for free.

---

## 5. Wire the eye icon into existing material cards

Only swap the existing eye-icon placeholders (no new buttons, no thumbnails anywhere).

- `src/routes/tl.tsx` — two existing `<Eye />` buttons (Receive-from-WD list and SOH list): wrap with `MaterialImageViewer`.
- `src/routes/wd.tsx` (WD dispatch-confirm material rows), `src/routes/wd-stock-track.tsx` (WD SOH cards), `src/routes/stock.tsx` (WSP SOH cards): add the same `MaterialImageViewer` eye icon to the right of the qty badge using the same styling already used in `tl.tsx`. Disabled/faded when `image_path` is null.
- `src/routes/movements.tsx` and other non-material-card screens: no change.

Lists derive `hasImage` from the materials map; no image bytes loaded until the user taps.

---

## 6. Out of scope (explicitly unchanged)

- `stock`, `wd_stock`, `stock_movements`, dispatch/TL/loss/concern RPCs.
- All permissions outside the two narrow grants above.
- Reporting / exports (`src/lib/export-*.ts`).
- The WSP receipt PO proof flow (still required, still uses `ProofImageUpload`).
- AppShell redirect logic, auth, roles.

---

## Technical notes

- Compression runs entirely client-side; no server function needed.
- Signed URLs expire after 10 min and are created per-click — keeps lists fast and avoids leaking a public bucket.
- A material's image is overwritten only when a WSP user explicitly re-uploads during a receipt; otherwise the first image sticks (matches "all future references reuse the same image").
- Migration touches only `public.materials` schema + storage RLS; no data migration for the 60+ existing materials (their `image_path` stays null and the eye icon is shown faded until someone uploads via the next receipt).
