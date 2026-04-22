
-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'wd';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tl';

-- 2. Add wd_code to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wd_code text;

-- 3. New enum for per-item dispatch status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispatch_item_status') THEN
    CREATE TYPE public.dispatch_item_status AS ENUM ('pending', 'received', 'issue');
  END IF;
END$$;

-- 4. Add status / confirmation columns to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS item_status public.dispatch_item_status,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS issue_note text;

-- Backfill existing dispatch rows as already-received (since old flow deducted stock immediately)
UPDATE public.stock_movements
SET item_status = 'received',
    confirmed_at = created_at
WHERE movement = 'dispatch' AND item_status IS NULL;

-- 5. WD stock table
CREATE TABLE IF NOT EXISTS public.wd_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  material_code text NOT NULL REFERENCES public.materials(code),
  qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wd_code, material_code)
);
ALTER TABLE public.wd_stock ENABLE ROW LEVEL SECURITY;

-- 6. WD ↔ WSP assignment table
CREATE TABLE IF NOT EXISTS public.wd_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  wsp public.wsp_code NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wd_code, wsp)
);
ALTER TABLE public.wd_assignments ENABLE ROW LEVEL SECURITY;

-- 7. Helper: current user's wd_code
CREATE OR REPLACE FUNCTION public.current_user_wd()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wd_code FROM public.profiles WHERE id = auth.uid()
$$;

-- 8. RLS: wd_stock — WD user sees their own; admin sees all
DROP POLICY IF EXISTS "WD can view own stock" ON public.wd_stock;
CREATE POLICY "WD can view own stock" ON public.wd_stock
  FOR SELECT TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'));

-- (no client INSERT/UPDATE policy — only the SECURITY DEFINER RPC writes here)

-- 9. RLS: wd_assignments — admins manage; WD user reads own
DROP POLICY IF EXISTS "Admins manage assignments" ON public.wd_assignments;
CREATE POLICY "Admins manage assignments" ON public.wd_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "WD can view own assignments" ON public.wd_assignments;
CREATE POLICY "WD can view own assignments" ON public.wd_assignments
  FOR SELECT TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'));

-- 10. Extend stock_movements visibility so WD users see dispatches sent to them
DROP POLICY IF EXISTS "WD can view dispatches to them" ON public.stock_movements;
CREATE POLICY "WD can view dispatches to them" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    movement = 'dispatch'
    AND distributor = public.current_user_wd()
    AND EXISTS (
      SELECT 1 FROM public.wd_assignments a
      WHERE a.wd_code = public.current_user_wd() AND a.wsp = stock_movements.wsp
    )
  );

-- 11. Replace dispatch_materials: NO stock deduction at dispatch time, set item_status='pending'
CREATE OR REPLACE FUNCTION public.dispatch_materials(
  _distributor text,
  _proof_image_path text,
  _items jsonb,
  _dispatch_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _wsp public.wsp_code;
  _proof text;
  _dist text;
  _ddate date;
  _dispatch_id uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _current integer;
  _seen text[] := array[]::text[];
  -- aggregate pending-for-this-wsp commitments per material to avoid over-committing
  _pending integer;
begin
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'At least one line item is required';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'Proof image is required';
  end if;

  _dist := nullif(btrim(_distributor), '');
  if _dist is null then
    raise exception 'Distributor is required';
  end if;

  _ddate := coalesce(_dispatch_date, current_date);
  if _ddate > current_date then
    raise exception 'Dispatch date cannot be in the future';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  for _item in select * from jsonb_array_elements(_items) loop
    _code := _item->>'material_code';
    _qty := (_item->>'qty')::integer;

    if _code is null or btrim(_code) = '' then
      raise exception 'Material code is required for every item';
    end if;
    if _qty is null or _qty <= 0 then
      raise exception 'Quantity must be positive for material %', _code;
    end if;
    if _code = any(_seen) then
      raise exception 'Duplicate material % in dispatch', _code;
    end if;
    _seen := array_append(_seen, _code);

    -- Available = current WSP stock minus quantities already in transit (item_status='pending')
    select qty into _current from public.stock
      where wsp = _wsp and material_code = _code;
    if _current is null then
      raise exception 'No stock for material %', _code;
    end if;

    select coalesce(sum(qty), 0) into _pending
      from public.stock_movements
      where wsp = _wsp
        and material_code = _code
        and movement = 'dispatch'
        and item_status = 'pending';

    if _qty > (_current - _pending) then
      raise exception 'Not enough available stock for material % (have %, in-transit %, need %)',
        _code, _current, _pending, _qty;
    end if;

    -- NO stock deduction here — happens on confirmation.
    insert into public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by,
      proof_image_path, dispatch_id, dispatch_date, item_status
    )
    values (
      _wsp, _code, _qty, 'dispatch', _dist, auth.uid(),
      _proof, _dispatch_id, _ddate, 'pending'
    );
  end loop;

  return _dispatch_id;
end;
$$;

-- 12. Confirm a single dispatch line item (Received or Issue)
CREATE OR REPLACE FUNCTION public.confirm_dispatch_item(
  _movement_id uuid,
  _action text,             -- 'received' or 'issue'
  _note text DEFAULT NULL
)
RETURNS public.dispatch_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _row public.stock_movements%ROWTYPE;
  _wd text;
  _is_admin boolean;
  _new_status public.dispatch_item_status;
begin
  if _action not in ('received', 'issue') then
    raise exception 'Invalid action %', _action;
  end if;

  select * into _row from public.stock_movements
    where id = _movement_id and movement = 'dispatch'
    for update;
  if _row.id is null then
    raise exception 'Dispatch line not found';
  end if;
  if _row.item_status <> 'pending' then
    raise exception 'Line is already %', _row.item_status;
  end if;

  _is_admin := public.has_role(auth.uid(), 'admin');
  _wd := public.current_user_wd();

  if not _is_admin then
    if _wd is null or _wd <> _row.distributor then
      raise exception 'Not authorised to confirm this line';
    end if;
    if not exists (
      select 1 from public.wd_assignments
      where wd_code = _wd and wsp = _row.wsp
    ) then
      raise exception 'WD is not assigned to receive from this WSP';
    end if;
  end if;

  if _action = 'received' then
    -- Deduct from WSP stock
    update public.stock
      set qty = qty - _row.qty, updated_at = now()
      where wsp = _row.wsp and material_code = _row.material_code;
    -- Add to WD stock
    insert into public.wd_stock (wd_code, material_code, qty, updated_at)
    values (_row.distributor, _row.material_code, _row.qty, now())
    on conflict (wd_code, material_code) do update
      set qty = public.wd_stock.qty + excluded.qty,
          updated_at = now();
    _new_status := 'received';
  else
    _new_status := 'issue';
  end if;

  update public.stock_movements
    set item_status = _new_status,
        confirmed_at = now(),
        confirmed_by = auth.uid(),
        issue_note = case when _action = 'issue' then _note else issue_note end
    where id = _movement_id;

  return _new_status;
end;
$$;

-- 13. View: derived dispatch status per dispatch_id
CREATE OR REPLACE VIEW public.dispatch_status_v
WITH (security_invoker = on) AS
SELECT
  dispatch_id,
  case
    when bool_and(item_status = 'received') then 'received'
    when bool_or(item_status = 'received') and bool_or(item_status in ('pending','issue')) then 'partially_received'
    when bool_and(item_status = 'pending') then 'in_transit'
    else 'in_transit'
  end as status,
  count(*) as total_items,
  sum(case when item_status = 'received' then 1 else 0 end) as received_items,
  sum(case when item_status = 'issue' then 1 else 0 end) as issue_items,
  sum(case when item_status = 'pending' then 1 else 0 end) as pending_items
FROM public.stock_movements
WHERE movement = 'dispatch' AND dispatch_id IS NOT NULL
GROUP BY dispatch_id;

GRANT SELECT ON public.dispatch_status_v TO authenticated;
