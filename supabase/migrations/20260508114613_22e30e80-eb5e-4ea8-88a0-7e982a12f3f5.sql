
DO $$
DECLARE
  ids uuid[] := ARRAY[
    '9be2070e-77c3-4d06-9ad2-86652cbfd156'::uuid,
    'ebcc26ae-78eb-48eb-bc18-dbe6e88f2c0f'::uuid,
    '7158c2a9-4eb7-4a91-a42a-5de5c63c8c53'::uuid
  ];
BEGIN
  DELETE FROM public.user_roles WHERE user_id = ANY(ids);
  DELETE FROM public.ae_assignments WHERE ae_user_id = ANY(ids);
  UPDATE public.wd_tls SET user_id = NULL WHERE user_id = ANY(ids);
  DELETE FROM public.profiles WHERE id = ANY(ids);
  DELETE FROM auth.users WHERE id = ANY(ids);
END $$;
