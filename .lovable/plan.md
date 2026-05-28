## Goal
Add the WSP → WD mappings from the uploaded Excel for the two newly added WSPs (CEVJ, CEVY) so that switching WSP context correctly filters WDs, stock, dispatch, and reports. CEVL stays untouched.

## What's already in place
- `wd_assignments` table is the WSP→WD mapping source of truth (used by RLS on `stock_movements` and by `useWdAssignments`).
- Current state: only 3 CEVL rows (VI3180, VI3391, VI3948). No CEVJ/CEVY mappings exist yet.
- All WDs from the Excel already exist in `hierarchy_wd` — no WD master records need to be created.
- Unique constraint `(wd_code, wsp)` already prevents duplicates.

## Mappings to insert
From the uploaded sheet:
- **CEVJ → 51 WDs** (VI1961, VI1970, VI2283, VI3055, VI3103, VI3146, VI3152, VI3163, VI3164, VI3182, VI3183, VI3185, VI3199, VI3229, VI3249, VI3251, VI3253, VI3254, VI3293, VI3309, VI3310, VI3316, VI3338, VI3339, VI3345, VI3352, VI3353, VI3355, VI3357, VI3382, VI3388, VI3422, VI3447, VI3449, VI3453, VI3474, VI3485, VI3487, VI3489, VI3496, VI3567, VI3588, VI3592, VI3804, VI3806, VI3826, VI3857, VI3865, VI3868, VI3895, VI3905)
- **CEVY → 21 WDs** (VI2941, VI3061, VI3137, VI3140, VI3220, VI3276, VI3322, VI3328, VI3346, VI3367, VI3379, VI3380, VI3395, VI3411, VI3412, VI3457, VI3533, VI3856, VI3872, VI3886, VI3899)

## Execution
Single `INSERT INTO public.wd_assignments (wd_code, wsp) VALUES (...), (...) ON CONFLICT (wd_code, wsp) DO NOTHING;` covering all 72 rows.

## What is NOT changed
- No CEVL rows touched.
- No schema changes, no RLS changes, no code changes.
- No edits to `hierarchy_wd`, `wd_stock`, `stock_movements`, or any operational data.
- Existing WSP switching, stock logic, dispatch flow, and exports already consume `wd_assignments` — no UI work needed.

## Verification after import
- `SELECT wsp, count(*) FROM wd_assignments GROUP BY wsp;` should show CEVL=3, CEVJ=51, CEVY=21.
- In the app, switching to CEVJ/CEVY should now surface only their mapped WDs in dispatch destinations and WD-side visibility.
