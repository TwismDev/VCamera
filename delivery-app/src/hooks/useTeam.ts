import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

/** Everyone in the org, so the boss can pick a driver and see the roster. */
export function useTeam(orgId: string | null | undefined) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('full_name');

    setMembers((data ?? []) as Profile[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const drivers = members.filter((member) => member.role === 'driver');

  return { members, drivers, loading, reload: load };
}
