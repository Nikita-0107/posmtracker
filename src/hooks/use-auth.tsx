import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type WspCode = "CEVL" | "CEVJ" | "CEVY";

export type Profile = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
  wd_code: string | null;
};

const MOBILE_DOMAIN = "posm.local";

export function mobileToEmail(mobile: string): string {
  return `${mobile}@${MOBILE_DOMAIN}`;
}

type AuthContextValue = {
  session: Session | null;
  user: Session["user"] | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (mobile: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (
    mobile: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void> | undefined;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthState(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, mobile, display_name, wsp, wd_code")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("Failed to load profile", error);
      setProfile(null);
      return;
    }
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    // Auth listener FIRST, then getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        // defer profile load to avoid deadlocks inside the listener
        setTimeout(() => { void loadProfile(newSession.user.id); }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      if (existing?.user) void loadProfile(existing.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (mobile: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: mobileToEmail(mobile),
      password,
    });
    return { error };
  }, []);

  const signUp = useCallback(async (mobile: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email: mobileToEmail(mobile),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: {
          mobile,
          display_name: displayName ?? null,
        },
      },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    profile,
    isAuthenticated: !!session,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile: () => (session?.user ? loadProfile(session.user.id) : undefined),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  // Fallback: if provider is missing (e.g., during SSR shell), return a stable
  // unauthenticated snapshot so consumers don't crash. Real state arrives
  // once the provider mounts on the client.
  return {
    session: null,
    user: null,
    profile: null,
    isAuthenticated: false,
    loading: true,
    signIn: async () => ({ error: { message: "Auth provider not mounted" } }),
    signUp: async () => ({ error: { message: "Auth provider not mounted" } }),
    signOut: async () => {},
    refreshProfile: () => undefined,
  };
}
