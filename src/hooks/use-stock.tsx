import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type Material = { code: string; name: string };
export type StockRow = { material_code: string; qty: number };

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from("materials")
      .select("code, name")
      .order("code")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) console.error("Failed to load materials", error);
        setMaterials((data ?? []) as Material[]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { materials, loading };
}

export function useStock() {
  const { profile } = useAuth();
  const wsp = profile?.wsp ?? null;
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!wsp) {
      setStock({});
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("stock")
      .select("material_code, qty")
      .eq("wsp", wsp);
    if (error) {
      console.error("Failed to load stock", error);
      setStock({});
      setLoading(false);
      return;
    }
    const map: Record<string, number> = {};
    for (const row of (data ?? []) as StockRow[]) {
      map[row.material_code] = row.qty;
    }
    setStock(map);
    setLoading(false);
  }, [wsp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stock, loading, refresh };
}

export async function receiveMaterial(materialCode: string, qty: number) {
  const { data, error } = await supabase.rpc("receive_material", {
    _material_code: materialCode,
    _qty: qty,
  });
  return { newQty: data as number | null, error };
}

export async function dispatchMaterial(materialCode: string, qty: number, distributor: string) {
  const { data, error } = await supabase.rpc("dispatch_material", {
    _material_code: materialCode,
    _qty: qty,
    _distributor: distributor,
  });
  return { newQty: data as number | null, error };
}
