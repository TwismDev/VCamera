import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Role } from '@/lib/types';
import { stopTracking } from '@/services/tracking';

type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  org: Organization | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; fullName: string; phone?: string; role: Role }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setOrg(null);
      return;
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    setProfile((profileRow as Profile | null) ?? null);

    if (profileRow?.org_id) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profileRow.org_id)
        .maybeSingle();
      setOrg((orgRow as Organization | null) ?? null);
    } else {
      setOrg(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      await loadProfile(next?.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback<AuthValue['signUp']>(async ({ email, password, fullName, phone, role }) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone?.trim() || null, role } },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // Never leave a phone quietly broadcasting after the driver signs out.
    await stopTracking().catch(() => undefined);
    await supabase.auth.signOut();
    setProfile(null);
    setOrg(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, profile, org, loading, refresh, signIn, signUp, signOut }),
    [session, profile, org, loading, refresh, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
