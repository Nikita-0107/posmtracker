-- Add tl_type to profiles for TL classification (e.g. "Merch TL", "Sales TL")
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tl_type text;