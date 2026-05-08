DO $$
DECLARE
  v_user uuid := '33b1abc8-eb41-4888-a94c-d8492b38e419';
  v_good_wd_tl uuid := '50d5edef-f844-4ee2-9719-4435e44091df';
  v_dup_wd_tl  uuid := 'e2ae7279-7ecf-4ab4-b997-16788ce6e546';
  v_full_name text := '3180 ESWAR RAO 3888';
BEGIN
  DELETE FROM public.wd_tls WHERE id = v_dup_wd_tl;

  INSERT INTO public.hierarchy_tl (tl_id, tl_name, wd_code, active)
  VALUES ('3990', v_full_name, 'VI3180', true)
  ON CONFLICT (tl_id) DO UPDATE
    SET tl_name = EXCLUDED.tl_name, wd_code = EXCLUDED.wd_code,
        active = true, updated_at = now();

  DELETE FROM public.hierarchy_tl WHERE tl_id = '3888';

  UPDATE public.profiles
     SET mobile = '3990', tl_id = '3990',
         display_name = v_full_name, updated_at = now()
   WHERE id = v_user;

  UPDATE auth.users
     SET email = '3990@posm.local',
         raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb)
                              || jsonb_build_object('mobile','3990','display_name', v_full_name),
         updated_at = now()
   WHERE id = v_user;

  -- identities.email is a generated column — only update identity_data.
  UPDATE auth.identities
     SET identity_data = COALESCE(identity_data,'{}'::jsonb)
                         || jsonb_build_object('email','3990@posm.local'),
         updated_at = now()
   WHERE user_id = v_user;

  UPDATE public.wd_tls
     SET user_id = v_user, updated_at = now()
   WHERE id = v_good_wd_tl AND user_id IS DISTINCT FROM v_user;
END $$;