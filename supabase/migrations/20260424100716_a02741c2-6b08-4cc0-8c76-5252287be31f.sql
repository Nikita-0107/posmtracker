-- Track parent movement for split (partial-receipt) lines
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS parent_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_parent ON public.stock_movements(parent_movement_id);

-- Replace confirm_dispatch_item to support partial receipts.
-- Actions:
--   'received' -> mark whole line received, add full qty to WD stock, deduct from WSP stock
--   'issue'    -> mark whole line as issue (no stock movement), store note
--   'partial'  -> split: update original row to 'received' with _received_qty (move that qty),
--                 insert sibling row with the remaining qty as 'issue' (with note)
DROP FUNCTION IF EXISTS public.confirm_dispatch_item(uuid, text, text);
DROP FUNCTION IF EXISTS public.confirm_dispatch_item(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.confirm_dispatch_item(
  _movement_id uuid,
  _action text,
  _note text DEFAULT NULL,
  _received_qty integer DEFAULT NULL
) RETURNS public.dispatch_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  _row public.stock_movements%ROWTYPE;
  _wd text;
  _is_admin boolean;
  _new_status public.dispatch_item_status;
  _issue_qty integer;
  _new_id uuid;
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

  else -- partial
    if _received_qty is null or _received_qty < 0 then
      raise exception 'Received quantity must be >= 0';
    end if;
    if _received_qty > _row.qty then
      raise exception 'Received quantity cannot exceed total (%, got %)', _row.qty, _received_qty;
    end if;
    if _received_qty = 0 then
      -- Whole line is an issue
      _new_status := 'issue';
      update public.stock_movements
        set item_status = _new_status,
            confirmed_at = now(),
            confirmed_by = auth.uid(),
            issue_note = _note
        where id = _movement_id;
    elsif _received_qty = _row.qty then
      -- Treat as fully received
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

      -- Move received qty into WD stock
      update public.stock
        set qty = qty - _received_qty, updated_at = now()
        where wsp = _row.wsp and material_code = _row.material_code;
      insert into public.wd_stock (wd_code, material_code, qty, updated_at)
      values (_row.distributor, _row.material_code, _received_qty, now())
      on conflict (wd_code, material_code) do update
        set qty = public.wd_stock.qty + excluded.qty,
            updated_at = now();

      -- Original row -> received with reduced qty
      update public.stock_movements
        set qty = _received_qty,
            item_status = 'received',
            confirmed_at = now(),
            confirmed_by = auth.uid()
        where id = _movement_id;

      -- Sibling row -> issue for remaining qty
      _new_id := gen_random_uuid();
      insert into public.stock_movements (
        id, wsp, material_code, qty, movement, distributor, performed_by,
        proof_image_path, dispatch_id, dispatch_date, item_status,
        confirmed_at, confirmed_by, issue_note, parent_movement_id
      ) values (
        _new_id, _row.wsp, _row.material_code, _issue_qty, 'dispatch',
        _row.distributor, _row.performed_by,
        _row.proof_image_path, _row.dispatch_id, _row.dispatch_date, 'issue',
        now(), auth.uid(), _note, _row.id
      );

      _new_status := 'received'; -- status of the original row
    end if;
  end if;

  return _new_status;
end;
$function$;