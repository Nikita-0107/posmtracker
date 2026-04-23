-- 1. Extend movement_type enum with tl_issue
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'tl_issue';
