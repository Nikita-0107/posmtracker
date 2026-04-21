-- Add batch_type enum
DO $$ BEGIN
  CREATE TYPE public.batch_type AS ENUM ('Launch', 'Cyclical', 'SOV', 'Others');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add new columns to stock_movements (nullable; only used by 'receive' rows)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS batch_type public.batch_type;

-- Update receive_material RPC to accept and store the new fields.
-- Reference number is renamed to "invoice number" in the UI but stored
-- in the existing reference_number column to avoid breaking history.
CREATE OR REPLACE FUNCTION public.receive_material(
  _material_code text,
  _qty integer,
  _reference_number text,
  _proof_image_path text,
  _received_date date DEFAULT NULL,
  _batch_type public.batch_type DEFAULT NULL
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
  _rdate date;
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  _ref := nullif(btrim(_reference_number), '');
  if _ref is null then
    raise exception 'Invoice number is required';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'Proof image is required';
  end if;

  _rdate := coalesce(_received_date, current_date);
  if _rdate > current_date then
    raise exception 'Received date cannot be in the future';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  if not exists (select 1 from public.materials where code = _material_code) then
    raise exception 'Material % does not exist', _material_code;
  end if;

  if exists (
    select 1 from public.stock_movements
    where wsp = _wsp
      and material_code = _material_code
      and movement = 'receive'
      and reference_number = _ref
  ) then
    raise exception 'Duplicate entry detected' using errcode = 'unique_violation';
  end if;

  insert into public.stock (wsp, material_code, qty, updated_at)
  values (_wsp, _material_code, _qty, now())
  on conflict (wsp, material_code) do update
    set qty = public.stock.qty + excluded.qty,
        updated_at = now()
  returning qty into _new_qty;

  insert into public.stock_movements (
    wsp, material_code, qty, movement, performed_by,
    reference_number, proof_image_path, received_date, batch_type
  )
  values (
    _wsp, _material_code, _qty, 'receive', auth.uid(),
    _ref, _proof, _rdate, _batch_type
  );

  return _new_qty;
end;
$function$;