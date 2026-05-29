CREATE POLICY "WSP users read own wsp assignments"
ON public.wd_assignments FOR SELECT
TO authenticated
USING (wsp = current_user_wsp());