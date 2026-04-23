-- Add new dispatch item statuses for issue resolution lifecycle
ALTER TYPE public.dispatch_item_status ADD VALUE IF NOT EXISTS 'closed_loss';
ALTER TYPE public.dispatch_item_status ADD VALUE IF NOT EXISTS 'resolved';
