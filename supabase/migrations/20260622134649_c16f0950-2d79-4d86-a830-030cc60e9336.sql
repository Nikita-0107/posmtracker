
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.receipt_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  wsp public.wsp_code NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  total_items INT NOT NULL DEFAULT 0,
  received_items INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.receipt_plan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.receipt_plans(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL,
  material_description TEXT,
  is_new_material BOOLEAN NOT NULL DEFAULT false,
  planned_qty INT NOT NULL CHECK (planned_qty > 0),
  received_qty INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received')),
  proof_image_path TEXT,
  material_image_path TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_plan_items_plan ON public.receipt_plan_items(plan_id);
CREATE INDEX idx_receipt_plans_wsp_status ON public.receipt_plans(wsp, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_plans TO authenticated;
GRANT ALL ON public.receipt_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_plan_items TO authenticated;
GRANT ALL ON public.receipt_plan_items TO service_role;

ALTER TABLE public.receipt_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage receipt plans"
  ON public.receipt_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "WSP users view their plans"
  ON public.receipt_plans FOR SELECT TO authenticated
  USING (wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "WSP users update their plans"
  ON public.receipt_plans FOR UPDATE TO authenticated
  USING (wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage receipt plan items"
  ON public.receipt_plan_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "WSP users view their plan items"
  ON public.receipt_plan_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receipt_plans p
      WHERE p.id = receipt_plan_items.plan_id
        AND p.wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "WSP users update their plan items"
  ON public.receipt_plan_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receipt_plans p
      WHERE p.id = receipt_plan_items.plan_id
        AND p.wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receipt_plans p
      WHERE p.id = receipt_plan_items.plan_id
        AND p.wsp = (SELECT wsp FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE TRIGGER trg_receipt_plans_updated_at
  BEFORE UPDATE ON public.receipt_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_receipt_plan_items_updated_at
  BEFORE UPDATE ON public.receipt_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
