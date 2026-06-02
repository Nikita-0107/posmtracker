
-- Add active flag to AE and WD (TL already has it)
ALTER TABLE public.hierarchy_ae ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.hierarchy_wd ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Audit log
CREATE TABLE IF NOT EXISTS public.master_data_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,           -- 'ae' | 'wd' | 'tl'
  entity_id text NOT NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_data_audit_entity ON public.master_data_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_master_data_audit_changed_at ON public.master_data_audit(changed_at DESC);

GRANT SELECT ON public.master_data_audit TO authenticated;
GRANT ALL ON public.master_data_audit TO service_role;

ALTER TABLE public.master_data_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view master data audit"
  ON public.master_data_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
