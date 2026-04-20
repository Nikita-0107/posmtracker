-- Add reference_number column to stock_movements
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS reference_number text;

-- Unique index: same material + reference cannot be received twice (per WSP)
-- Only enforced for 'receive' movements
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_receive_ref_unique
ON public.stock_movements (wsp, material_code, reference_number)
WHERE movement = 'receive' AND reference_number IS NOT NULL;

-- Update receive_material RPC to accept and validate reference_number
CREATE OR REPLACE FUNCTION public.receive_material(
  _material_code text,
  _qty integer,
  _reference_number text
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
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  _ref := nullif(btrim(_reference_number), '');
  if _ref is null then
    raise exception 'Reference number is required';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  if not exists (select 1 from public.materials where code = _material_code) then
    raise exception 'Material % does not exist', _material_code;
  end if;

  -- Duplicate check
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

  insert into public.stock_movements (wsp, material_code, qty, movement, performed_by, reference_number)
  values (_wsp, _material_code, _qty, 'receive', auth.uid(), _ref);

  return _new_qty;
end;
$function$;

-- Drop the old 2-arg signature so callers must pass reference_number
DROP FUNCTION IF EXISTS public.receive_material(text, integer);