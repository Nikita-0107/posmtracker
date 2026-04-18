import { useEffect, useState } from "react";

export const WSP_OPTIONS = ["CEVL", "CEVJ", "CEVY"] as const;
export type Wsp = (typeof WSP_OPTIONS)[number];

const STORAGE_KEY = "posm.activeWsp";
const DEFAULT_WSP: Wsp = "CEVL";

const listeners = new Set<(w: Wsp) => void>();

function readStored(): Wsp {
  if (typeof window === "undefined") return DEFAULT_WSP;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return (WSP_OPTIONS as readonly string[]).includes(v ?? "") ? (v as Wsp) : DEFAULT_WSP;
}

export function useWsp(): [Wsp, (w: Wsp) => void] {
  const [wsp, setWspState] = useState<Wsp>(DEFAULT_WSP);

  useEffect(() => {
    setWspState(readStored());
    const update = (w: Wsp) => setWspState(w);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const setWsp = (w: Wsp) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, w);
    }
    listeners.forEach((fn) => fn(w));
  };

  return [wsp, setWsp];
}
