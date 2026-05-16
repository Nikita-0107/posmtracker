
-- 1. Add WD Receiver flag on hierarchy_tl
ALTER TABLE public.hierarchy_tl
  ADD COLUMN IF NOT EXISTS is_wd_receiver boolean NOT NULL DEFAULT false;

-- At most one designated WD receiver per WD
CREATE UNIQUE INDEX IF NOT EXISTS hierarchy_tl_one_receiver_per_wd
  ON public.hierarchy_tl(wd_code)
  WHERE is_wd_receiver = true;

-- 2. Helper: is the current TL the designated WD receiver?
CREATE OR REPLACE FUNCTION public.current_user_tl_is_wd_receiver()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hierarchy_tl
    WHERE tl_id = (SELECT tl_id FROM public.profiles WHERE id = auth.uid())
      AND is_wd_receiver = true
      AND active = true
  );
$$;

-- 3. RLS: TL receiver can view + update dispatches addressed to their WD
DROP POLICY IF EXISTS "TL receiver views dispatches" ON public.stock_movements;
CREATE POLICY "TL receiver views dispatches"
ON public.stock_movements FOR SELECT
TO authenticated
USING (
  movement = 'dispatch'::movement_type
  AND public.current_user_tl_is_wd_receiver()
  AND distributor = public.current_user_tl_wd_code()
);

DROP POLICY IF EXISTS "TL receiver updates dispatches" ON public.stock_movements;
CREATE POLICY "TL receiver updates dispatches"
ON public.stock_movements FOR UPDATE
TO authenticated
USING (
  movement = 'dispatch'::movement_type
  AND public.current_user_tl_is_wd_receiver()
  AND distributor = public.current_user_tl_wd_code()
)
WITH CHECK (
  movement = 'dispatch'::movement_type
  AND public.current_user_tl_is_wd_receiver()
  AND distributor = public.current_user_tl_wd_code()
);

-- 4. Allow TL receiver to call confirm_dispatch_item for their WD's dispatches
CREATE OR REPLACE FUNCTION public.confirm_dispatch_item(_movement_id uuid, _action text, _note text DEFAULT NULL::text, _received_qty integer DEFAULT NULL::integer)
 RETURNS dispatch_item_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _row public.stock_movements%ROWTYPE;
  _wd text;
  _ae_wds text[];
  _is_admin boolean;
  _tl_wd text;
  _tl_is_recv boolean;
  _new_status public.dispatch_item_status;
  _issue_qty integer;
  _new_id uuid;
  _notify_issue boolean := false;
  _notify_qty integer;
  _recipient uuid;
begin
  if _action not in ('received', 'issue', 'partial') then
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

  _is_admin  := public.has_role(auth.uid(), 'admin');
  _wd        := public.current_user_wd();
  _ae_wds    := public.current_user_ae_wds();
  _tl_wd     := public.current_user_tl_wd_code();
  _tl_is_recv:= public.current_user_tl_is_wd_receiver();

  if not _is_admin then
    if not (
      (_wd is not null and _wd = _row.distributor)
      or (_ae_wds is not null and _row.distributor = ANY(_ae_wds))
      or (_tl_is_recv and _tl_wd is not null and _tl_wd = _row.distributor)
    ) then
      raise exception 'Not authorised to confirm this line';
    end if;
  end if;

  if _action = 'received' then
    update public.stock
      set qty = qty - _row.qty, updated_at = now()
      where wsp = _row.wsp and material_code = _row.material_code;

    insert into public.wd_stock(wd_code, material_code, qty)
      values (_row.distributor, _row.material_code, _row.qty)
    on conflict (wd_code, material_code) do update
      set qty = public.wd_stock.qty + excluded.qty,
          updated_at = now();

    _new_status := 'received';
  elsif _action = 'issue' then
    _new_status := 'issue';
    _notify_issue := true;
    _notify_qty := _row.qty;
  else
    if _received_qty is null or _received_qty <= 0 or _received_qty >= _row.qty then
      raise exception 'Invalid partial qty';
    end if;
    _issue_qty := _row.qty - _received_qty;

    -- mutate parent into received portion
    update public.stock_movements
      set qty = _received_qty,
          item_status = 'received',
          confirmed_at = now(),
          confirmed_by = auth.uid()
      where id = _row.id;

    update public.stock
      set qty = qty - _received_qty, updated_at = now()
      where wsp = _row.wsp and material_code = _row.material_code;

    insert into public.wd_stock(wd_code, material_code, qty)
      values (_row.distributor, _row.material_code, _received_qty)
    on conflict (wd_code, material_code) do update
      set qty = public.wd_stock.qty + excluded.qty,
          updated_at = now();

    -- create issue sibling
    insert into public.stock_movements(
      wsp, material_code, qty, movement, distributor, performed_by,
      reference_number, proof_image_path, received_date, batch_type,
      dispatch_id, dispatch_date, invoice_file_path, item_status,
      confirmed_at, confirmed_by, issue_note, parent_movement_id
    )
    values (
      _row.wsp, _row.material_code, _issue_qty, 'dispatch', _row.distributor, _row.performed_by,
      _row.reference_number, _row.proof_image_path, _row.received_date, _row.batch_type,
      _row.dispatch_id, _row.dispatch_date, _row.invoice_file_path, 'issue',
      now(), auth.uid(), _note, _row.id
    )
    returning id into _new_id;

    _notify_issue := true;
    _notify_qty := _issue_qty;
    return 'issue'::public.dispatch_item_status;
  end if;

  update public.stock_movements
    set item_status = _new_status,
        confirmed_at = now(),
        confirmed_by = auth.uid(),
        issue_note = case when _action = 'issue' then _note else issue_note end
    where id = _movement_id;

  if _notify_issue then
    select id into _recipient from public.profiles
      where wsp = _row.wsp limit 1;
    if _recipient is not null then
      insert into public.notifications(user_id, type, title, body, related_id)
        values (_recipient, 'dispatch_issue',
                'Dispatch issue reported',
                format('WD %s reported issue on %s qty %s', _row.distributor, _row.material_code, _notify_qty),
                _row.id);
    end if;
  end if;

  return _new_status;
end;
$function$;
