import React from 'react';

import { Loading } from '@/components/ui';

/**
 * Nothing is decided here. The auth gate in the root layout reads the session
 * and replaces this screen with the right destination, so this only ever shows
 * for the moment between launch and that decision.
 */
export default function Index() {
  return <Loading label="Getting things ready" />;
}
