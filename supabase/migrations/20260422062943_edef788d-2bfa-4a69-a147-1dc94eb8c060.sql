-- Make invoice file optional in receive_material_with_create RPC
-- Field renamed to "PO Number" in UI; invoice file upload removed.

CREATE OR REPLACE FUNCTION public.receive_material_with_create(
  _material_code text,
  _material_name text,
  _qty integer,
  _reference_number text,
  _proof_image_path text,
  _invoice_file_path text DEFAULT NULL,
  _received_date date DEFAULT NULL,
  _batch_type batch_type DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _wsp public.wsp_code;
  _new_qty integer;
  _ref text;
  _proof text;
  _invoice text;
  _rdate date;
  _code text;
  _name text;
begin
  _code := nullif(btrim(_material_code), '');
  if _code is null then
    raise exception 'Material code is required';
  end if;

  _name := nullif(btrim(_material_name), '');

  if _qty is null or _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  _ref := nullif(btrim(_reference_number), '');
  if _ref is null then
    raise exception 'PO number is required';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'PO image is required';
  end if;

  -- Invoice file is now optional (nullable)
  _invoice := nullif(btrim(_invoice_file_path), '');

  _rdate := coalesce(_received_date, current_date);
  if _rdate > current_date then
    raise exception 'Received date cannot be in the future';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  if not exists (select 1 from public.materials where code = _code) then
    if _name is null then
      raise exception 'Description is required for a new material';
    end if;
    insert into public.materials (code, name) values (_code, _name);
  end if;

  -- Duplicate check: same WSP + material + PO number
  if exists (
    select 1 from public.stock_movements
    where wsp = _wsp
      and material_code = _code
      and movement = 'receive'
      and reference_number = _ref
  ) then
    raise exception 'Duplicate entry detected' using errcode = 'unique_violation';
  end if;

  insert into public.stock (wsp, material_code, qty, updated_at)
  values (_wsp, _code, _qty, now())
  on conflict (wsp, material_code) do update
    set qty = public.stock.qty + excluded.qty,
        updated_at = now()
  returning qty into _new_qty;

  insert into public.stock_movements (
    wsp, material_code, qty, movement, performed_by,
    reference_number, proof_image_path, invoice_file_path,
    received_date, batch_type
  )
  values (
    _wsp, _code, _qty, 'receive', auth.uid(),
    _ref, _proof, _invoice, _rdate, _batch_type
  );

  return _new_qty;
end;
$function$;