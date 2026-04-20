-- Admin policies on profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all user_roles (existing "Admins can manage roles" covers ALL but its USING applies to all commands;
-- the existing "Users can view their own roles" is restrictive for SELECT — adding explicit admin SELECT for clarity is unnecessary
-- since the ALL policy already grants SELECT. No change needed for user_roles.