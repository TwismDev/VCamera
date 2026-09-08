import { Alert, Linking, Platform } from 'react-native';

import type { LatLng } from '@/lib/geo';

export type NavApp = 'waze' | 'google' | 'system';

export const NAV_APP_LABEL: Record<NavApp, string> = {
  waze: 'Waze',
  google: 'Google Maps',
  system: Platform.OS === 'ios' ? 'Apple Maps' : 'Maps',
};

type Destination = { address: string; coords?: LatLng | null };

/**
 * Hands the delivery address off to a real navigation app. Each app gets its
 * native deep link first (so it opens straight into turn-by-turn) and a web URL
 * as the fallback when the app is not installed.
 */
export async function openNavigation(app: NavApp, destination: Destination): Promise<void> {
  const { deepLink, webLink } = buildLinks(app, destination);

  try {
    if (deepLink && (await Linking.canOpenURL(deepLink))) {
      await Linking.openURL(deepLink);
      return;
    }
    await Linking.openURL(webLink);
  } catch {
    Alert.alert('Could not open maps', `No app on this phone could handle ${NAV_APP_LABEL[app]}.`);
  }
}

function buildLinks(app: NavApp, { address, coords }: Destination) {
  const q = encodeURIComponent(address);
  const ll = coords ? `${coords.lat},${coords.lng}` : null;

  switch (app) {
    case 'waze':
      return {
        deepLink: ll ? `waze://?ll=${ll}&navigate=yes` : `waze://?q=${q}&navigate=yes`,
        webLink: ll
          ? `https://waze.com/ul?ll=${ll}&navigate=yes`
          : `https://waze.com/ul?q=${q}&navigate=yes`,
      };

    case 'google':
      return {
        deepLink:
          Platform.OS === 'ios'
            ? `comgooglemaps://?daddr=${ll ?? q}&directionsmode=driving`
            : `google.navigation:q=${ll ?? q}`,
        webLink: `https://www.google.com/maps/dir/?api=1&destination=${ll ?? q}&travelmode=driving`,
      };

    case 'system':
    default:
      return {
        deepLink:
          Platform.OS === 'ios'
            ? `maps://?daddr=${ll ?? q}&dirflg=d`
            : `geo:0,0?q=${ll ? `${ll}(${q})` : q}`,
        webLink: `https://www.google.com/maps/dir/?api=1&destination=${ll ?? q}&travelmode=driving`,
      };
  }
}

export function openDialer(phone: string): void {
  const scheme = Platform.OS === 'ios' ? 'telprompt:' : 'tel:';
  Linking.openURL(`${scheme}${phone.replace(/\s+/g, '')}`).catch(() => {
    Alert.alert('Could not start the call', phone);
  });
}
