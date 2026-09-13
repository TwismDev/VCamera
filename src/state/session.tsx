import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { fetchOrg, fetchProfile } from '@/api/profiles';
import { supabase } from '@/lib/supabase';
import type { Org, Profile } from '@/lib/types';

interface SessionState {
  /** Null until the stored session has been read back from disk. */
  initialising: boolean;
  session: Session | null;
  profile: Profile | null;
  org: Org | null;
  /** True once signed in but before a team has been created or joined. */
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [initialising, setInitialising] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);

  // Guards against a slow load for a signed-out user overwriting the state of
  // whoever signed in after them.
  const loadToken = useRef(0);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    const token = ++loadToken.current;

    if (!userId) {
      setProfile(null);
      setOrg(null);
      return;
    }

    try {
      const nextProfile = await fetchProfile(userId);
      if (token !== loadToken.current) return;
      setProfile(nextProfile);

      const nextOrg = nextProfile?.org_id ? await fetchOrg(nextProfile.org_id) : null;
      if (token !== loadToken.current) return;
      setOrg(nextOrg);
    } catch (error) {
      if (token !== loadToken.current) return;
      console.warn('Could not load your profile', error);
      setProfile(null);
      setOrg(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setInitialising(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session?.user.id);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setOrg(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      initialising,
      session,
      profile,
      org,
      needsOnboarding: Boolean(session) && (!profile || !profile.org_id),
      refresh,
      signOut,
    }),
    [initialising, session, profile, org, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}

/** Session narrowed to a signed-in user who already belongs to a team. */
export function useActiveSession(): { profile: Profile; org: Org; userId: string } {
  const { profile, org, session } = useSession();
  if (!profile || !org || !session) {
    throw new Error('useActiveSession used outside an authenticated, onboarded screen');
  }
  return { profile, org, userId: session.user.id };
}
