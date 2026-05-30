## Change

Move TL `32629 SRIKANTH` from WD `VI3391` (Pavani Enterprises) to WD `VI3233` (Sai Venkata Narasimha Enterprises) in `hierarchy_tl`.

Per the uploaded AE mapping, 32629 belongs under VI3233. Currently the WD-admin page lists him under VI3391, and when he logs in the TL portal also shows VI3391 — which is why he cannot use the app correctly. Fixing `hierarchy_tl.wd_code` for `tl_id = 32629` corrects both screens (they read from the same row).

## Not doing

- VI3896 Sri Gurudatta Agencies — leave deleted, do not re-add.
- TL name mismatches for `3989 PRUDVI` and `3990 / 3180 ESWAR RAO 3888` — leave names as they are in the database.

## Technical

Single data update via the insert tool:

```sql
UPDATE public.hierarchy_tl
SET wd_code = 'VI3233'
WHERE tl_id = '32629';
```

No schema changes, no code changes. After the update, SRIKANTH will appear under VI3233 in the WD-admin page and his TL portal will show VI3233 / Sai Venkata Narasimha Enterprises.