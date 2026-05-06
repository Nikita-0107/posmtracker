
-- Allow TL records to exist without a WD assignment (pending state)
ALTER TABLE public.wd_tls ALTER COLUMN wd_code DROP NOT NULL;

-- Drop the unique (wd_code, tl_name) constraint that prevents multiple pending rows
-- with the same (NULL, name) — actually NULLs are fine in unique. Keep it.

-- TL submits their TL ID. Either claims an existing unlinked wd_tls row
-- (with the same legacy_tl_id) -> auto-activated, or creates a pending row
-- with no wd_code -> waits for admin WD assignment.
CREATE OR REPLACE FUNCTION public.tl_submit_setup(_legacy_tl_id integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row_id uuid;
  _name text;
  _mobile text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _legacy_tl_id IS NULL OR _legacy_tl_id <= 0 THEN
    RAISE EXCEPTION 'A valid TL ID is required';
  END IF;
  IF NOT public.has_role(_uid, 'tl'::public.app_role) THEN
    RAISE EXCEPTION 'Only TL users can complete TL setup';
  END IF;

  -- Already linked? Update the TL ID and return.
  SELECT id INTO _row_id FROM public.wd_tls WHERE user_id = _uid LIMIT 1;
  IF _row_id IS NOT NULL THEN
    UPDATE public.wd_tls
       SET legacy_tl_id = _legacy_tl_id, updated_at = now()
     WHERE id = _row_id;
    RETURN _row_id;
  END IF;

  SELECT display_name, mobile INTO _name, _mobile FROM public.profiles WHERE id = _uid;

  -- Claim an unlinked existing TL record by legacy id (auto-activation)
  SELECT id INTO _row_id
    FROM public.wd_tls
   WHERE legacy_tl_id = _legacy_tl_id AND user_id IS NULL
   ORDER BY (wd_code IS NULL), created_at
   LIMIT 1
   FOR UPDATE;

  IF _row_id IS NOT NULL THEN
    UPDATE public.wd_tls
       SET user_id = _uid,
           tl_name = COALESCE(_name, tl_name),
           updated_at = now()
     WHERE id = _row_id;
    RETURN _row_id;
  END IF;

  -- Create a pending row (no WD yet) — admin must assign WD
  INSERT INTO public.wd_tls (user_id, legacy_tl_id, tl_name, wd_code)
  VALUES (_uid, _legacy_tl_id, COALESCE(_name, 'TL ' || _mobile), NULL)
  RETURNING id INTO _row_id;

  RETURN _row_id;
END;
$$;

-- Admin (or AE for their WDs) assigns a WD to a pending TL.
CREATE OR REPLACE FUNCTION public.admin_assign_wd_to_tl(
  _wd_tl_id uuid, _wd_code text, _wd_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _wd_code IS NULL OR btrim(_wd_code) = '' THEN
    RAISE EXCEPTION 'WD code is required';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR _wd_code = ANY (public.current_user_ae_wds())
  ) THEN
    RAISE EXCEPTION 'Not authorised to assign this WD';
  END IF;

  UPDATE public.wd_tls
     SET wd_code = _wd_code,
         wd_name = COALESCE(_wd_name, wd_name),
         updated_at = now()
   WHERE id = _wd_tl_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TL record not found';
  END IF;
END;
$$;

-- List TL users that have submitted TL ID but await WD assignment.
CREATE OR REPLACE FUNCTION public.list_pending_tl_setups()
RETURNS TABLE(
  wd_tl_id uuid, user_id uuid, mobile text, display_name text,
  legacy_tl_id integer, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.user_id, p.mobile, p.display_name, t.legacy_tl_id, t.created_at
  FROM public.wd_tls t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.user_id IS NOT NULL
    AND (t.wd_code IS NULL OR btrim(t.wd_code) = '')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY t.created_at DESC;
$$;
