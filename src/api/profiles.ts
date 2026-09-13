import { supabase } from '@/lib/supabase';
import type { Org, Profile } from '@/lib/types';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function fetchOrg(orgId: string): Promise<Org | null> {
  const { data, error } = await supabase.from('orgs').select('*').eq('id', orgId).maybeSingle();
  if (error) throw error;
  return (data as Org | null) ?? null;
}

export async function updateProfile(
  userId: string,
  changes: Partial<Pick<Profile, 'full_name' | 'phone' | 'push_token'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

/** Creates the company and promotes the caller to dispatcher. */
export async function createOrg(name: string): Promise<Org> {
  const { data, error } = await supabase.rpc('create_org', { p_name: name });
  if (error) throw error;
  return data as Org;
}

/** Joins an existing company with the code the dispatcher shared. */
export async function joinOrg(code: string): Promise<Org> {
  const { data, error } = await supabase.rpc('join_org', { p_code: code });
  if (error) throw error;
  return data as Org;
}

export async function rotateJoinCode(): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_join_code');
  if (error) throw error;
  return data as string;
}

export async function listDrivers(orgId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('role', 'driver')
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function setDriverActive(driverId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', driverId);
  if (error) throw error;
}
