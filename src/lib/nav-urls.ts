/**
 * Deep links into the navigation apps a driver already uses.
 *
 * Worth knowing: these links are one-way. Waze and Google Maps will start
 * turn-by-turn guidance, but neither can hand its ETA back to another app.
 * That is why the app computes its own estimate (see src/lib/eta.ts and the
 * route-eta edge function) instead of trying to read one out of Waze.
 */

import type { LatLng } from './geo';

export type NavigationApp = 'waze' | 'google' | 'apple';

export interface Destination {
  coordinate?: LatLng | null;
  address: string;
}

const encode = (value: string): string => encodeURIComponent(value.trim());

/** Scheme URL, which opens the installed app directly. */
export function nativeUrl(app: NavigationApp, destination: Destination): string {
  const { coordinate, address } = destination;

  switch (app) {
    case 'waze':
      return coordinate
        ? `waze://?ll=${coordinate.lat},${coordinate.lng}&navigate=yes`
        : `waze://?q=${encode(address)}&navigate=yes`;
    case 'google':
      return coordinate
        ? `comgooglemaps://?daddr=${coordinate.lat},${coordinate.lng}&directionsmode=driving`
        : `comgooglemaps://?daddr=${encode(address)}&directionsmode=driving`;
    case 'apple':
      return coordinate
        ? `maps://?daddr=${coordinate.lat},${coordinate.lng}&dirflg=d`
        : `maps://?daddr=${encode(address)}&dirflg=d`;
  }
}

/** Https URL, which opens the app when installed and the website otherwise. */
export function webUrl(app: NavigationApp, destination: Destination): string {
  const { coordinate, address } = destination;

  switch (app) {
    case 'waze':
      return coordinate
        ? `https://waze.com/ul?ll=${coordinate.lat}%2C${coordinate.lng}&navigate=yes`
        : `https://waze.com/ul?q=${encode(address)}&navigate=yes`;
    case 'google':
      return coordinate
        ? `https://www.google.com/maps/dir/?api=1&destination=${coordinate.lat},${coordinate.lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${encode(address)}&travelmode=driving`;
    case 'apple':
      return coordinate
        ? `https://maps.apple.com/?daddr=${coordinate.lat},${coordinate.lng}&dirflg=d`
        : `https://maps.apple.com/?daddr=${encode(address)}&dirflg=d`;
  }
}

export const NAVIGATION_APP_LABELS: Record<NavigationApp, string> = {
  waze: 'Waze',
  google: 'Google Maps',
  apple: 'Apple Maps',
};
