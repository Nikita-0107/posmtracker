-- Restrict loss_approvers SELECT to admins and the approver themselves
DROP POLICY IF EXISTS "Authenticated can read loss_approvers" ON public.loss_approvers;

CREATE POLICY "Admins or self can read loss_approvers"
ON public.loss_approvers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);

-- Revoke EXECUTE on trigger-only SECURITY DEFINER function so it cannot be called from the API
REVOKE EXECUTE ON FUNCTION public.set_material_image_from_movement() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_material_image_from_movement() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_material_image_from_movement() FROM authenticated;