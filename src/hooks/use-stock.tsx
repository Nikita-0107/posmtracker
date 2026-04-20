import { useEffect, useState } from "react";
import { initialStock } from "@/lib/posm-data";
import { WSP_OPTIONS, type Wsp } from "@/hooks/use-wsp";

// WSP-scoped stock: { [wsp]: { [materialCode]: qty } }
export type StockMap = Record<Wsp, Record<string, number>>;

const STORAGE_KEY = "posm.stockByWsp";

function emptyStock(): StockMap {
  return WSP_OPTIONS.reduce((acc, w) => {
    acc[w] = w === "CEVL" ? { ...initialStock } : {};
    return acc;
  }, {} as StockMap);
}

let memoryStore: StockMap = emptyStock();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StockMap>;
      const base = emptyStock();
      for (const w of WSP_OPTIONS) {
        if (parsed[w]) base[w] = { ...base[w], ...parsed[w] };
      }
      memoryStore = base;
    }
  } catch {
    // ignore corrupt storage
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
  } catch {
    // ignore quota errors
  }
}

const listeners = new Set<(s: StockMap) => void>();
function emit() {
  listeners.forEach((fn) => fn(memoryStore));
}

export function useStock() {
  const [store, setStore] = useState<StockMap>(memoryStore);

  useEffect(() => {
    hydrate();
    setStore(memoryStore);
    const fn = (s: StockMap) => setStore({ ...s });
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return store;
}

export function getStockFor(wsp: Wsp, code: string): number {
  hydrate();
  return memoryStore[wsp]?.[code] ?? 0;
}

/** Receive: increment WSP stock for material. Creates entry if missing. */
export function receiveStock(wsp: Wsp, code: string, qty: number): number {
  hydrate();
  if (qty <= 0) return memoryStore[wsp]?.[code] ?? 0;
  const current = memoryStore[wsp]?.[code] ?? 0;
  const next = current + qty;
  memoryStore = {
    ...memoryStore,
    [wsp]: { ...memoryStore[wsp], [code]: next },
  };
  persist();
  emit();
  return next;
}

/** Dispatch: decrement WSP stock. Returns { ok, remaining }. */
export function dispatchStock(
  wsp: Wsp,
  code: string,
  qty: number,
): { ok: boolean; remaining: number; error?: string } {
  hydrate();
  const current = memoryStore[wsp]?.[code] ?? 0;
  if (qty <= 0) return { ok: false, remaining: current, error: "Invalid quantity" };
  if (qty > current) return { ok: false, remaining: current, error: "Not enough stock available" };
  const next = current - qty;
  memoryStore = {
    ...memoryStore,
    [wsp]: { ...memoryStore[wsp], [code]: next },
  };
  persist();
  emit();
  return { ok: true, remaining: next };
}
