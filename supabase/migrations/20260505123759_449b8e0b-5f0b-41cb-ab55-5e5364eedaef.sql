
-- Add new admin role values for WSP and WD
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'wsp_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'wd_admin';
