import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * `supabase.channel(topic)` hands back an *existing* channel when one with that
 * topic is already open. A fixed topic therefore breaks on any effect re-run —
 * fast refresh, a dependency change, React's double-invoked effects — because
 * the second run receives a channel that is already subscribed, and `.on()`
 * throws "cannot add postgres_changes callbacks after subscribe()". The channel
 * is then never wired up and live updates stop arriving.
 *
 * Every subscription therefore gets its own topic.
 */
let channelSequence = 0;

type TableFilter = {
  /** Table in the public schema to watch. */
  table: string;
  /** PostgREST-style filter, e.g. `org_id=eq.<uuid>`. */
  filter?: string;
  /** Defaults to every change. */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
};

/**
 * Subscribes to row changes and returns an unsubscribe function suitable for
 * returning straight out of a `useEffect`.
 */
export function subscribeToChanges(
  name: string,
  { table, filter, event = '*' }: TableFilter,
  onChange: () => void,
): () => void {
  channelSequence += 1;
  const channel: RealtimeChannel = supabase.channel(`${name}:${channelSequence}`);

  channel
    .on('postgres_changes', { event, schema: 'public', table, ...(filter ? { filter } : {}) }, () =>
      onChange(),
    )
    .subscribe();

  return () => {
    // Removing also unsubscribes; the promise is not awaited because a unique
    // topic means a slow teardown can no longer collide with the next channel.
    void supabase.removeChannel(channel);
  };
}
