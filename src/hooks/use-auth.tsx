import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type WspCode = "CEVL" | "CEVJ" | "CEVY";

export type Profile = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
};

const MOBILE_DOMAIN = "posm.local";

export function mobileToEmail(mobile: string): string {
  return `${mobile}@${MOBILE_DOMAIN}`;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, mobile, display_name, wsp")
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
    refreshProfile: () => session?.user && loadProfile(session.user.id),
  };
}
