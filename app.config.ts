import type { ExpoConfig } from 'expo/config';

/**
 * Native configuration.
 *
 * Secrets are never checked in. Values come from the shell environment (or an
 * untracked .env file) at build time. See .env.example and the README.
 */
const config: ExpoConfig = {
  name: 'Delivery Tracker',
  slug: 'delivery-tracker',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'deliverytracker',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],

  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.example.deliverytracker',
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
    },
    infoPlist: {
      // Background location keeps the dispatcher's map live while a driver is
      // on a run. iOS requires every string below or the build is rejected.
      NSLocationWhenInUseUsageDescription:
        'Your location is shared with your dispatcher while you are on a delivery so they can see your progress and give customers an accurate arrival time.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Your location is shared with your dispatcher while a delivery is in progress, including when the app is in the background. Tracking stops as soon as you complete the delivery.',
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
      // Required so canOpenURL() can detect installed navigation apps.
      LSApplicationQueriesSchemes: ['waze', 'comgooglemaps', 'maps'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: process.env.ANDROID_PACKAGE ?? 'com.example.deliverytracker',
    adaptiveIcon: { backgroundColor: '#0B1220' },
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID },
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'WAKE_LOCK',
    ],
  },

  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Your location is shared with your dispatcher while a delivery is in progress.',
        locationWhenInUsePermission:
          'Your location is shared with your dispatcher while you are on a delivery.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#2563EB',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B1220',
        imageWidth: 200,
      },
    ],
    'expo-web-browser',
  ],

  experiments: {
    // Turn on once you have run `expo start` at least once: typed routes need
    // the generated .expo/types, which do not exist on a fresh checkout.
    typedRoutes: false,
  },

  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
