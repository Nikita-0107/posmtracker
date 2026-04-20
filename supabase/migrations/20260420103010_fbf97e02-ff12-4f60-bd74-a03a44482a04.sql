-- Add proof image path to stock_movements
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS proof_image_path text;

-- Create private storage bucket for proof images
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for proofs bucket
-- Path convention: {wsp}/{auth.uid()}/{filename}
CREATE POLICY "Users can upload proofs for their WSP"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proofs'
  AND (storage.foldername(name))[1] = (public.current_user_wsp())::text
);

CREATE POLICY "Users can view proofs for their WSP"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proofs'
  AND (
    (storage.foldername(name))[1] = (public.current_user_wsp())::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- Update receive_material RPC to require proof image path
CREATE OR REPLACE FUNCTION public.receive_material(
  _material_code text,
  _qty integer,
  _reference_number text,
  _proof_image_path text
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
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  _ref := nullif(btrim(_reference_number), '');
  if _ref is null then
    raise exception 'Reference number is required';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'Proof image is required';
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

  insert into public.stock_movements (wsp, material_code, qty, movement, performed_by, reference_number, proof_image_path)
  values (_wsp, _material_code, _qty, 'receive', auth.uid(), _ref, _proof);

  return _new_qty;
end;
$function$;

DROP FUNCTION IF EXISTS public.receive_material(text, integer, text);

-- Update dispatch_material RPC to require proof image path
CREATE OR REPLACE FUNCTION public.dispatch_material(
  _material_code text,
  _qty integer,
  _distributor text,
  _proof_image_path text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _wsp public.wsp_code;
  _current integer;
  _new_qty integer;
  _proof text;
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  _proof := nullif(btrim(_proof_image_path), '');
  if _proof is null then
    raise exception 'Proof image is required';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  select qty into _current from public.stock
    where wsp = _wsp and material_code = _material_code
    for update;

  if _current is null then
    raise exception 'No stock for material %', _material_code;
  end if;

  if _qty > _current then
    raise exception 'Not enough stock available';
  end if;

  update public.stock
    set qty = qty - _qty, updated_at = now()
    where wsp = _wsp and material_code = _material_code
    returning qty into _new_qty;

  insert into public.stock_movements (wsp, material_code, qty, movement, distributor, performed_by, proof_image_path)
  values (_wsp, _material_code, _qty, 'dispatch', _distributor, auth.uid(), _proof);

  return _new_qty;
end;
$function$;

DROP FUNCTION IF EXISTS public.dispatch_material(text, integer, text);