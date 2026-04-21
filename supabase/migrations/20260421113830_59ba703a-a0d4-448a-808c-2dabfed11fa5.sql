-- Add dispatch grouping + date columns to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS dispatch_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_date date;

CREATE INDEX IF NOT EXISTS idx_stock_movements_dispatch_id
  ON public.stock_movements (dispatch_id)
  WHERE dispatch_id IS NOT NULL;

-- Multi-item dispatch RPC. Atomic: any failure rolls back the whole batch.
-- _items is a JSON array of { material_code: text, qty: int }
CREATE OR REPLACE FUNCTION public.dispatch_materials(
  _distributor text,
  _proof_image_path text,
  _items jsonb,
  _dispatch_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    select qty into _current from public.stock
      where wsp = _wsp and material_code = _code
      for update;

    if _current is null then
      raise exception 'No stock for material %', _code;
    end if;
    if _qty > _current then
      raise exception 'Not enough stock for material % (have %, need %)', _code, _current, _qty;
    end if;

    update public.stock
      set qty = qty - _qty, updated_at = now()
      where wsp = _wsp and material_code = _code;

    insert into public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by,
      proof_image_path, dispatch_id, dispatch_date
    )
    values (
      _wsp, _code, _qty, 'dispatch', _dist, auth.uid(),
      _proof, _dispatch_id, _ddate
    );
  end loop;

  return _dispatch_id;
end;
$function$;