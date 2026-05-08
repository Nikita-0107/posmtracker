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

  _is_admin := public.has_role(auth.uid(), 'admin');
  _wd := public.current_user_wd();
  _ae_wds := public.current_user_ae_wds();

  if not _is_admin then
    -- Allow if: user's profile WD matches (legacy single-WD), OR the dispatch's WD
    -- is in the user's AE hierarchy (new multi-WD AE model).
    if not (
      (_wd is not null and _wd = _row.distributor)
      or (_ae_wds is not null and _row.distributor = ANY(_ae_wds))
    ) then
      raise exception 'Not authorised to confirm this line';
    end if;
  end if;

  if _action = 'received' then
    update public.stock
      set qty = qty - _row.qty, updated_at = now()
      where wsp = _row.wsp and material_code = _row.material_code;
    insert into public.wd_stock (wd_code, material_code, qty, updated_at)
    values (_row.distributor, _row.material_code, _row.qty, now())
    on conflict (wd_code, material_code) do update
      set qty = public.wd_stock.qty + excluded.qty,
          updated_at = now();
    _new_status := 'received';

    update public.stock_movements
      set item_status = _new_status,
          confirmed_at = now(),
          confirmed_by = auth.uid()
      where id = _movement_id;

  elsif _action = 'issue' then
    _new_status := 'issue';
    update public.stock_movements
      set item_status = _new_status,
          confirmed_at = now(),
          confirmed_by = auth.uid(),
          issue_note = _note
      where id = _movement_id;
    _notify_issue := true;
    _notify_qty := _row.qty;

  else
    if _received_qty is null or _received_qty < 0 then
      raise exception 'Received quantity must be >= 0';
    end if;
    if _received_qty > _row.qty then
      raise exception 'Received quantity cannot exceed total (%, got %)', _row.qty, _received_qty;
    end if;
    if _received_qty = 0 then
      _new_status := 'issue';
      update public.stock_movements
        set item_status = _new_status,
            confirmed_at = now(),
            confirmed_by = auth.uid(),
            issue_note = _note
        where id = _movement_id;
      _notify_issue := true;
      _notify_qty := _row.qty;
    elsif _received_qty = _row.qty then
      update public.stock
        set qty = qty - _row.qty, updated_at = now()
        where wsp = _row.wsp and material_code = _row.material_code;
      insert into public.wd_stock (wd_code, material_code, qty, updated_at)
      values (_row.distributor, _row.material_code, _row.qty, now())
      on conflict (wd_code, material_code) do update
        set qty = public.wd_stock.qty + excluded.qty,
            updated_at = now();
      _new_status := 'received';
      update public.stock_movements
        set item_status = _new_status,
            confirmed_at = now(),
            confirmed_by = auth.uid()
        where id = _movement_id;
    else
      _issue_qty := _row.qty - _received_qty;
      update public.stock
        set qty = qty - _received_qty, updated_at = now()
        where wsp = _row.wsp and material_code = _row.material_code;
      insert into public.wd_stock (wd_code, material_code, qty, updated_at)
      values (_row.distributor, _row.material_code, _received_qty, now())
      on conflict (wd_code, material_code) do update
        set qty = public.wd_stock.qty + excluded.qty,
            updated_at = now();
      update public.stock_movements
        set qty = _received_qty,
            item_status = 'received',
            confirmed_at = now(),
            confirmed_by = auth.uid()
        where id = _movement_id;
      insert into public.stock_movements (
        movement, wsp, distributor, material_code, qty, dispatch_id,
        dispatch_date, item_status, issue_note, parent_movement_id,
        proof_image_path, reference_number, created_by, confirmed_at, confirmed_by
      )
      values (
        _row.movement, _row.wsp, _row.distributor, _row.material_code, _issue_qty,
        _row.dispatch_id, _row.dispatch_date, 'issue', _note, _row.id,
        _row.proof_image_path, _row.reference_number, _row.created_by, now(), auth.uid()
      ) returning id into _new_id;
      _new_status := 'received';
      _notify_issue := true;
      _notify_qty := _issue_qty;
    end if;
  end if;

  if _notify_issue then
    select id into _recipient from public.profiles where wsp = _row.wsp limit 1;
    if _recipient is not null then
      insert into public.notifications (user_id, kind, title, body, link, ref_id)
      values (
        _recipient,
        'wsp_issue',
        'Dispatch issue reported',
        format('WD %s reported an issue on %s (qty %s)', _row.distributor, _row.material_code, _notify_qty),
        '/wsp-issues',
        _row.dispatch_id
      );
    end if;
  end if;

  return _new_status;
end;
$function$;