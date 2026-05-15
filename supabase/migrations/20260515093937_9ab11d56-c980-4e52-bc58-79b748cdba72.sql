-- Allow TL users to insert and view their own inactivity reasons
CREATE POLICY "TL insert own inactivity reasons"
ON public.tl_inactivity_reasons
FOR INSERT
TO authenticated
WITH CHECK (
  wd_tl_id = current_user_wd_tl_id()
  AND created_by = auth.uid()
);

CREATE POLICY "TL view own inactivity reasons"
ON public.tl_inactivity_reasons
FOR SELECT
TO authenticated
USING (wd_tl_id = current_user_wd_tl_id());