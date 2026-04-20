DROP POLICY IF EXISTS "Admins can add materials" ON public.materials;

CREATE POLICY "Authenticated users can add materials"
ON public.materials
FOR INSERT
TO authenticated
WITH CHECK (true);