import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from './env';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no URL to read a session back from in a native app.
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
});

/**
 * Supabase refreshes the access token on a timer. That timer is unreliable once
 * the OS suspends the app, so it is stopped in the background and restarted on
 * return. Without this a driver who backgrounds the app for an hour comes back
 * to failing writes.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
