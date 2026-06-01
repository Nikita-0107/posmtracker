
-- 1) Set search_path on email queue wrapper functions (security hardening)
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions that should never be called by unauthenticated users.
--    Keep authenticated/service_role access intact.

REVOKE EXECUTE ON FUNCTION public.get_tl_streak(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tl_streak(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_loss_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_loss_approval(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.decide_loss_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decide_loss_approval(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_loss_approver(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_loss_approver(uuid) TO authenticated, service_role;

-- Trigger function — only the trigger executor needs it; revoke from public/anon.
REVOKE EXECUTE ON FUNCTION public.set_dispatch_plan_code() FROM PUBLIC, anon;

-- Email queue wrappers — only server-side code (service_role) and authenticated callers should reach them.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
