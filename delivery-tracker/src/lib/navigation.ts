import { Linking, Platform } from 'react-native';

import { NAVIGATION_APP_LABELS, nativeUrl, webUrl, type Destination, type NavigationApp } from './nav-urls';

export { NAVIGATION_APP_LABELS, type Destination, type NavigationApp };

/**
 * Hands the delivery address to a navigation app.
 *
 * The scheme URL is tried first because it opens the installed app straight
 * into guidance. If that fails the https link is used, which opens the app when
 * it is installed and the website when it is not, so the driver is never left
 * with a dead button.
 */
export async function openNavigation(app: NavigationApp, destination: Destination): Promise<boolean> {
  const native = nativeUrl(app, destination);
  const web = webUrl(app, destination);

  try {
    // iOS refuses canOpenURL for schemes absent from LSApplicationQueriesSchemes,
    // which app.config.ts declares. Android has no such check, so the open is
    // simply attempted and any failure falls through.
    if (Platform.OS !== 'ios' || (await Linking.canOpenURL(native))) {
      await Linking.openURL(native);
      return true;
    }
  } catch {
    // fall through to the web link
  }

  try {
    await Linking.openURL(web);
    return true;
  } catch {
    return false;
  }
}

/** Navigation apps worth offering on this platform, best first. */
export function availableNavigationApps(): NavigationApp[] {
  return Platform.OS === 'ios' ? ['waze', 'google', 'apple'] : ['waze', 'google'];
}

export async function dialPhone(phone: string): Promise<void> {
  const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
  try {
    await Linking.openURL(url);
  } catch {
    // A tablet with no dialler is not an error worth interrupting the driver for.
  }
}
