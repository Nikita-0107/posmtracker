-- Add receive_id column to link multiple receive line items under one PO header
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS receive_id uuid;

CREATE INDEX IF NOT EXISTS idx_stock_movements_receive_id
ON public.stock_movements (receive_id)
WHERE receive_id IS NOT NULL;

-- New atomic multi-item receive RPC
CREATE OR REPLACE FUNCTION public.receive_materials(
  _reference_number text,
  _proof_image_path text,
  _items jsonb,
  _received_date date DEFAULT NULL,
  _batch_type batch_type DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _wsp public.wsp_code;
  _ref text;
  _proof text;
  _rdate date;
  _receive_id uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _name text;
  _qty integer;
  _seen text[] := array[]::text[];
begin
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'At least one line item is required';
  end if;

  _ref := nullif(btrim(_reference_number), '');
  if _ref is null then
    raise exception 'PO number is required';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'PO image is required';
  end if;

  _rdate := coalesce(_received_date, current_date);
  if _rdate > current_date then
    raise exception 'Received date cannot be in the future';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  for _item in select * from jsonb_array_elements(_items) loop
    _code := nullif(btrim(_item->>'material_code'), '');
    _name := nullif(btrim(_item->>'material_name'), '');
    _qty := nullif(_item->>'qty', '')::integer;

    if _code is null then
      raise exception 'Material code is required for every item';
    end if;
    if _qty is null or _qty <= 0 then
      raise exception 'Quantity must be positive for material %', _code;
    end if;
    if _code = any(_seen) then
      raise exception 'Duplicate material % in this PO', _code;
    end if;
    _seen := array_append(_seen, _code);

    -- Create material if it doesn't exist yet
    if not exists (select 1 from public.materials where code = _code) then
      if _name is null then
        raise exception 'Description is required for new material %', _code;
      end if;
      insert into public.materials (code, name) values (_code, _name);
    end if;

    -- Duplicate guard: same WSP + material + PO number can't repeat
    if exists (
      select 1 from public.stock_movements
      where wsp = _wsp
        and material_code = _code
        and movement = 'receive'
        and reference_number = _ref
    ) then
      raise exception 'Duplicate entry: PO % already exists for material %', _ref, _code
        using errcode = 'unique_violation';
    end if;

    insert into public.stock (wsp, material_code, qty, updated_at)
    values (_wsp, _code, _qty, now())
    on conflict (wsp, material_code) do update
      set qty = public.stock.qty + excluded.qty,
          updated_at = now();

    insert into public.stock_movements (
      wsp, material_code, qty, movement, performed_by,
      reference_number, proof_image_path, received_date, batch_type, receive_id
    )
    values (
      _wsp, _code, _qty, 'receive', auth.uid(),
      _ref, _proof, _rdate, _batch_type, _receive_id
    );
  end loop;

  return _receive_id;
end;
$function$;