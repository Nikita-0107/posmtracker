import { useEffect, useState } from "react";

const STORAGE_KEY = "posm.auth.mobile";
const listeners = new Set<(v: string | null) => void>();

let memoryMobile: string | null = null;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  memoryMobile = window.localStorage.getItem(STORAGE_KEY);
}

export function useAuth() {
  const [mobile, setMobile] = useState<string | null>(memoryMobile);

  useEffect(() => {
    hydrate();
    setMobile(memoryMobile);
    const fn = (v: string | null) => setMobile(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return {
    mobile,
    isAuthenticated: !!mobile,
    signIn: (m: string) => {
      memoryMobile = m;
      hydrated = true;
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, m);
      listeners.forEach((fn) => fn(m));
    },
    signOut: () => {
      memoryMobile = null;
      hydrated = true;
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
      listeners.forEach((fn) => fn(null));
    },
  };
}
