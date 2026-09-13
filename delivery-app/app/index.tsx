import { Redirect } from 'expo-router';
import React from 'react';

import { Loading } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

/** Sends each person to the right home screen for who they are. */
export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) return <Loading label="Signing you in…" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <Loading label="Loading your profile…" />;
  if (!profile.org_id) return <Redirect href="/onboarding" />;

  return <Redirect href={profile.role === 'boss' ? '/boss' : '/driver'} />;
}
