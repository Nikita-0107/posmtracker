-- Roles enum
create type public.app_role as enum ('admin', 'wsp');

-- WSP enum
create type public.wsp_code as enum ('CEVL', 'CEVJ', 'CEVY');

-- ---------- PROFILES ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  mobile text not null unique,
  display_name text,
  wsp public.wsp_code,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ---------- USER ROLES ----------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can manage roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Helper: get current user's WSP
create or replace function public.current_user_wsp()
returns public.wsp_code
language sql
stable
security definer
set search_path = public
as $$
  select wsp from public.profiles where id = auth.uid()
$$;

-- ---------- MATERIALS ----------
create table public.materials (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;

create policy "Authenticated users can view materials"
  on public.materials for select
  to authenticated
  using (true);

create policy "Authenticated users can add materials"
  on public.materials for insert
  to authenticated
  with check (true);

-- ---------- STOCK ----------
create table public.stock (
  id uuid primary key default gen_random_uuid(),
  wsp public.wsp_code not null,
  material_code text not null references public.materials(code) on delete cascade,
  qty integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  unique (wsp, material_code)
);

alter table public.stock enable row level security;

create policy "Users can view stock for their WSP"
  on public.stock for select
  to authenticated
  using (
    wsp = public.current_user_wsp()
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Users can update stock for their WSP"
  on public.stock for update
  to authenticated
  using (
    wsp = public.current_user_wsp()
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Users can insert stock for their WSP"
  on public.stock for insert
  to authenticated
  with check (
    wsp = public.current_user_wsp()
    or public.has_role(auth.uid(), 'admin')
  );

-- ---------- STOCK MOVEMENTS ----------
create type public.movement_type as enum ('receive', 'dispatch');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  wsp public.wsp_code not null,
  material_code text not null references public.materials(code) on delete cascade,
  qty integer not null check (qty > 0),
  movement public.movement_type not null,
  distributor text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;

create policy "Users can view movements for their WSP"
  on public.stock_movements for select
  to authenticated
  using (
    wsp = public.current_user_wsp()
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Users can insert movements for their WSP"
  on public.stock_movements for insert
  to authenticated
  with check (
    wsp = public.current_user_wsp()
    or public.has_role(auth.uid(), 'admin')
  );

-- ---------- ATOMIC STOCK OPERATIONS ----------
create or replace function public.receive_material(
  _material_code text,
  _qty integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _wsp public.wsp_code;
  _new_qty integer;
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select wsp into _wsp from public.profiles where id = auth.uid();
  if _wsp is null then
    raise exception 'No WSP assigned to your account';
  end if;

  if not exists (select 1 from public.materials where code = _material_code) then
    raise exception 'Material % does not exist', _material_code;
  end if;

  insert into public.stock (wsp, material_code, qty, updated_at)
  values (_wsp, _material_code, _qty, now())
  on conflict (wsp, material_code) do update
    set qty = public.stock.qty + excluded.qty,
        updated_at = now()
  returning qty into _new_qty;

  insert into public.stock_movements (wsp, material_code, qty, movement, performed_by)
  values (_wsp, _material_code, _qty, 'receive', auth.uid());

  return _new_qty;
end;
$$;

create or replace function public.dispatch_material(
  _material_code text,
  _qty integer,
  _distributor text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _wsp public.wsp_code;
  _current integer;
  _new_qty integer;
begin
  if _qty <= 0 then
    raise exception 'Quantity must be positive';
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

  insert into public.stock_movements (wsp, material_code, qty, movement, distributor, performed_by)
  values (_wsp, _material_code, _qty, 'dispatch', _distributor, auth.uid());

  return _new_qty;
end;
$$;

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, mobile, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'mobile', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', null)
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'wsp')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();