import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveWsp } from "@/hooks/use-effective-wsp";

export type Material = { code: string; name: string; image_path?: string | null };
export type StockRow = { material_code: string; qty: number };

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("materials")
      .select("code, name, image_path")
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
  }, [refreshKey]);

  const addMaterial = useCallback(async (code: string, name: string) => {
    const { data, error } = await supabase
      .from("materials")
      .insert({ code, name })
      .select("code, name, image_path")
      .single();
    if (error) return { material: null, error };
    const newMat = data as Material;
    setMaterials((prev) =>
      [...prev.filter((m) => m.code !== newMat.code), newMat].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    );
    return { material: newMat, error: null };
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { materials, loading, addMaterial, refresh };
}

/** Lightweight lookup map by material code → image_path */
export function useMaterialImageMap(): Record<string, string | null> {
  const { materials } = useMaterials();
  const map: Record<string, string | null> = {};
  for (const m of materials) map[m.code] = m.image_path ?? null;
  return map;
}

export function useStock() {
  const { wsp: effectiveWsp } = useEffectiveWsp();
  const wsp = effectiveWsp ?? null;
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

export type BatchType = "Launch" | "Cyclical" | "SOV" | "Others";

export async function receiveMaterial(
  materialCode: string,
  materialName: string, // used only when creating a new material
  qty: number,
  poNumber: string,
  proofImagePath: string,
  receivedDate: string, // YYYY-MM-DD
  batchType: BatchType,
) {
  const { data, error } = await supabase.rpc("receive_material_with_create", {
    _material_code: materialCode,
    _material_name: materialName,
    _qty: qty,
    _reference_number: poNumber,
    _proof_image_path: proofImagePath,
    _received_date: receivedDate,
    _batch_type: batchType,
  });
  return { newQty: data as number | null, error };
}

export async function dispatchMaterial(
  materialCode: string,
  qty: number,
  distributor: string,
  proofImagePath: string,
) {
  const { data, error } = await supabase.rpc("dispatch_material", {
    _material_code: materialCode,
    _qty: qty,
    _distributor: distributor,
    _proof_image_path: proofImagePath,
  });
  return { newQty: data as number | null, error };
}

export type DispatchLineItem = { material_code: string; qty: number };

export type ReceiveLineItem = {
  material_code: string;
  material_name?: string; // required only when creating a new material
  qty: number;
  batch_type?: BatchType; // per-item batch type
};

export async function receiveMaterials(
  poNumber: string,
  proofImagePath: string,
  items: ReceiveLineItem[],
  receivedDate: string, // YYYY-MM-DD
) {
  const { data, error } = await supabase.rpc("receive_materials", {
    _reference_number: poNumber,
    _proof_image_path: proofImagePath,
    _items: items,
    _received_date: receivedDate,
  });
  return { receiveId: data as string | null, error };
}

export async function dispatchMaterials(
  distributor: string,
  proofImagePath: string,
  items: DispatchLineItem[],
  dispatchDate: string, // YYYY-MM-DD
) {
  const { data, error } = await supabase.rpc("dispatch_materials", {
    _distributor: distributor,
    _proof_image_path: proofImagePath,
    _items: items,
    _dispatch_date: dispatchDate,
  });
  return { dispatchId: data as string | null, error };
}
