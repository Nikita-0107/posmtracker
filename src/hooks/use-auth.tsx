import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type WspCode = "CEVL" | "CEVJ" | "CEVY";
export type AppRole = "admin" | "wsp_admin" | "wd_admin" | "wsp" | "wd" | "tl";

export type Profile = {
  id: string;
  mobile: string;
  display_name: string | null;
  wsp: WspCode | null;
  wd_code: string | null;
  ae_id: string | null;
  tl_id: string | null;
};

export type RolesBundle = {
  roles: AppRole[];
  aeWds: string[];
  tlReceiverWd: string | null;
};

const ID_DOMAIN = "posm.local";

export function idToEmail(id: string): string {
  return `${id.trim().toLowerCase()}@${ID_DOMAIN}`;
}
export const mobileToEmail = idToEmail;

type AuthContextValue = {
  session: Session | null;
  user: Session["user"] | null;
  profile: Profile | null;
  rolesBundle: RolesBundle | null;
  isAuthenticated: boolean;
  loading: boolean;
  rolesLoading: boolean;
  signIn: (id: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (
    id: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void> | undefined;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAuthBundle(userId: string): Promise<{ profile: Profile | null; rolesBundle: RolesBundle }> {
  // Phase 1: profile + user_roles in parallel (no deps).
  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, mobile, display_name, wsp, wd_code, ae_id, tl_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const profile = (profileRes.data as Profile | null) ?? null;
  const roles = ((rolesRes.data ?? []) as { role: AppRole }[]).map((x) => x.role);

  // Phase 2: hierarchy lookups depend on profile.ae_id / tl_id; run in parallel.
  const aeId = profile?.ae_id ?? null;
  const tlId = profile?.tl_id ?? null;

  const [aeWds, receiverWd] = await Promise.all([
    (async () => {
      if (!aeId) return [] as string[];
      const h = await supabase.from("hierarchy_wd").select("wd_code").eq("ae_id", aeId);
      const list = ((h.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
      if (list.length > 0) return list;
      // legacy fallback
      const aeRes = await supabase
        .from("ae_assignments")
        .select("wd_code")
        .eq("ae_user_id", userId);
      return ((aeRes.data ?? []) as { wd_code: string }[]).map((x) => x.wd_code);
    })(),
    (async () => {
      if (!tlId) return null;
      const { data } = await supabase
        .from("hierarchy_tl")
        .select("wd_code, is_wd_receiver, active")
        .eq("tl_id", tlId)
        .maybeSingle();
      const row = data as { wd_code: string; is_wd_receiver: boolean; active: boolean } | null;
      return row?.is_wd_receiver && row.active ? row.wd_code : null;
    })(),
  ]);

  return { profile, rolesBundle: { roles, aeWds, tlReceiverWd: receiverWd } };
}

function useAuthState(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rolesBundle, setRolesBundle] = useState<RolesBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  const loadBundle = useCallback(async (userId: string) => {
    setRolesLoading(true);
    try {
      const { profile: p, rolesBundle: rb } = await fetchAuthBundle(userId);
      setProfile(p);
      setRolesBundle(rb);
    } catch (e) {
      console.error("Failed to load auth bundle", e);
      setProfile(null);
      setRolesBundle({ roles: [], aeWds: [], tlReceiverWd: null });
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => { void loadBundle(newSession.user.id); }, 0);
      } else {
        setProfile(null);
        setRolesBundle(null);
        setRolesLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      if (existing?.user) {
        void loadBundle(existing.user.id);
      } else {
        setRolesLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadBundle]);

  const signIn = useCallback(async (id: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: idToEmail(id),
      password,
    });
    return { error };
  }, []);

  const signUp = useCallback(async (id: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email: idToEmail(id),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: {
          mobile: id,
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
    rolesBundle,
    isAuthenticated: !!session,
    loading,
    rolesLoading,
    signIn,
    signUp,
    signOut,
    refreshProfile: () => (session?.user ? loadBundle(session.user.id) : undefined),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  return {
    session: null,
    user: null,
    profile: null,
    rolesBundle: null,
    isAuthenticated: false,
    loading: true,
    rolesLoading: true,
    signIn: async () => ({ error: { message: "Auth provider not mounted" } }),
    signUp: async () => ({ error: { message: "Auth provider not mounted" } }),
    signOut: async () => {},
    refreshProfile: () => undefined,
  };
}
