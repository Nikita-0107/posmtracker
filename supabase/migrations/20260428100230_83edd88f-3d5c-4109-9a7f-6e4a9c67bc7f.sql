-- 1. Notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark their own notifications read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT/DELETE policy: only SECURITY DEFINER functions write.

-- 2. Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. Update dispatch_materials to notify WD recipients
CREATE OR REPLACE FUNCTION public.dispatch_materials(
  _distributor text,
  _proof_image_path text,
  _items jsonb,
  _dispatch_date date DEFAULT NULL::date
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
  _pending integer;
  _line_count integer := 0;
  _recipient uuid;
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

    insert into public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by,
      proof_image_path, dispatch_id, dispatch_date, item_status
    )
    values (
      _wsp, _code, _qty, 'dispatch', _dist, auth.uid(),
      _proof, _dispatch_id, _ddate, 'pending'
    );
    _line_count := _line_count + 1;
  end loop;

  -- Notify all WD users assigned to this distributor
  for _recipient in
    select p.id
      from public.profiles p
      join public.user_roles r on r.user_id = p.id
     where p.wd_code = _dist
       and r.role = 'wd'
  loop
    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      _recipient,
      'wd_allocation',
      'New allocation from ' || _wsp,
      _line_count || ' item(s) dispatched to you. Tap to confirm receipt.',
      '/wd',
      _dispatch_id
    );
  end loop;

  return _dispatch_id;
end;
$function$;

-- 4. Update confirm_dispatch_item to notify WSP on issue / partial-issue
CREATE OR REPLACE FUNCTION public.confirm_dispatch_item(
  _movement_id uuid,
  _action text,
  _note text DEFAULT NULL::text,
  _received_qty integer DEFAULT NULL::integer
)
RETURNS dispatch_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _row public.stock_movements%ROWTYPE;
  _wd text;
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

      _new_status := 'received';
      _notify_issue := true;
      _notify_qty := _issue_qty;
    end if;
  end if;

  -- Notify WSP users when an issue (full or partial) is raised
  if _notify_issue then
    for _recipient in
      select p.id
        from public.profiles p
        join public.user_roles r on r.user_id = p.id
       where p.wsp = _row.wsp
         and r.role = 'wsp'
    loop
      insert into public.notifications (user_id, type, title, body, link, related_id)
      values (
        _recipient,
        'wsp_issue',
        'Issue raised by ' || _row.distributor,
        _notify_qty || ' x ' || _row.material_code || ' flagged. Tap to resolve.',
        '/wsp-issues',
        _row.dispatch_id
      );
    end loop;
  end if;

  return _new_status;
end;
$function$;