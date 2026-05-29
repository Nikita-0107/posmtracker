
-- Bulk Dispatch Planning tables
CREATE TYPE public.dispatch_plan_status AS ENUM ('pending','executed','cancelled');

CREATE SEQUENCE IF NOT EXISTS public.dispatch_plan_seq;

CREATE TABLE public.dispatch_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text UNIQUE NOT NULL,
  wsp wsp_code NOT NULL,
  wd_code text NOT NULL,
  plan_date date NOT NULL DEFAULT current_date,
  status public.dispatch_plan_status NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_by uuid,
  executed_at timestamptz,
  dispatch_id uuid,
  cancelled_by uuid,
  cancelled_at timestamptz
);

CREATE INDEX idx_dispatch_plans_wsp_status ON public.dispatch_plans(wsp, status);

CREATE TABLE public.dispatch_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.dispatch_plans(id) ON DELETE CASCADE,
  material_code text NOT NULL,
  planned_qty integer NOT NULL CHECK (planned_qty > 0),
  actual_qty integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dispatch_plan_items_plan ON public.dispatch_plan_items(plan_id);

-- Plan code generator: PLAN-YYYY-NNN (yearly reset)
CREATE OR REPLACE FUNCTION public.set_dispatch_plan_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr text := to_char(now(), 'YYYY');
  n int;
BEGIN
  IF NEW.plan_code IS NULL OR NEW.plan_code = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(plan_code, '^PLAN-' || yr || '-', ''), '')::int), 0) + 1
      INTO n FROM public.dispatch_plans WHERE plan_code LIKE 'PLAN-' || yr || '-%';
    NEW.plan_code := 'PLAN-' || yr || '-' || lpad(n::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_set_dispatch_plan_code
BEFORE INSERT ON public.dispatch_plans
FOR EACH ROW EXECUTE FUNCTION public.set_dispatch_plan_code();

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.dispatch_plans TO authenticated;
GRANT ALL ON public.dispatch_plans TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.dispatch_plan_items TO authenticated;
GRANT ALL ON public.dispatch_plan_items TO service_role;
GRANT USAGE ON SEQUENCE public.dispatch_plan_seq TO authenticated, service_role;

-- RLS
ALTER TABLE public.dispatch_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own WSP plans" ON public.dispatch_plans
  FOR SELECT TO authenticated
  USING (wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin/WSP admin create plans" ON public.dispatch_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'wsp_admin'::app_role) AND wsp = current_user_wsp())
    )
  );

CREATE POLICY "Update own WSP plans" ON public.dispatch_plans
  FOR UPDATE TO authenticated
  USING (wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "View items via parent plan" ON public.dispatch_plan_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dispatch_plans p
    WHERE p.id = dispatch_plan_items.plan_id
    AND (p.wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Insert items via parent plan" ON public.dispatch_plan_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dispatch_plans p
    WHERE p.id = dispatch_plan_items.plan_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'wsp_admin'::app_role) AND p.wsp = current_user_wsp())
    )
  ));

CREATE POLICY "Update items via parent plan" ON public.dispatch_plan_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dispatch_plans p
    WHERE p.id = dispatch_plan_items.plan_id
    AND (p.wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dispatch_plans p
    WHERE p.id = dispatch_plan_items.plan_id
    AND (p.wsp = current_user_wsp() OR has_role(auth.uid(), 'admin'::app_role))
  ));
