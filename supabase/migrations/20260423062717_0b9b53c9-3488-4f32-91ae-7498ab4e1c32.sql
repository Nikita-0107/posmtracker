-- Update handle_new_user to NOT auto-assign the wsp role.
-- New users land on a "Pending Approval" screen until an admin assigns
-- them a role + entity (WSP code or WD code).
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

  -- Roles are intentionally NOT assigned here. An admin must grant
  -- the appropriate role (wsp / wd / tl) from the Admin Users page.
  return new;
end;
$$;