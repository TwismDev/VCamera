# Delivery Tracker

One app, two roles. A dispatcher sends out delivery jobs; a driver accepts them,
sends back an ETA, streams their GPS position while the job is underway, and
closes it off with the real product count and cash collected.

Built with Expo (React Native) so a single codebase runs on both Android and
iPhone, and Supabase for sign-in, the database, and the realtime feed that keeps
the dispatcher's board and map live.

---

## The flow it implements

| Step | Who | What happens |
| --- | --- | --- |
| 1 | Dispatcher | Creates a job: address, number of products, cash to collect, optional customer and notes. The address is geocoded on save, so the map pin and the driver's ETA work immediately. |
| 2 | Dispatcher | Assigns it to a driver. It appears on that driver's phone right away over the realtime feed — no refresh, no polling. |
| 3 | Driver | **Accepts** or declines. Accepting stamps the time server-side. |
| 4 | Driver | Taps **Calculate drive time** for an automatic ETA, adjusts the number if they know better, and sends it. Waze, Google Maps and the built-in maps app all open the address for actual navigation. |
| 5 | Driver | Taps **Start delivery**. Their position streams to the dispatcher every ~15 seconds (or every 30 m), in the background, with the screen off. |
| 6 | Dispatcher | Watches the live map: every driver, every active drop, distance remaining, speed, phone battery, and how long ago each position arrived. |
| 7 | Driver | Taps **Complete delivery**, confirms products delivered and cash collected (both pre-filled with what was sent out, editable if the drop came up short), adds a note. |
| 8 | Dispatcher | Sees it land as completed, with delivered-vs-sent and collected-vs-due side by side, and a warning banner if either came back short. Location sharing stops the moment the job closes. |
| 9 | Dispatcher | At knock-off, the **End of day sheet** totals the day's takings: cash collected, cash due, the difference, a per-driver breakdown of who is holding what, and every delivery with its customer name and time. Any earlier day can be pulled up with the arrows, and the whole thing copies out as plain text for a handover message. |

### About the ETA

You asked whether the app should work the ETA out itself or have the driver type
it — it does both, because neither alone is right. The app calculates a real
drive time from the driver's current position to the delivery address and
pre-fills it; the driver can then adjust it before sending, because they know
about the loading bay, the coffee stop, and the road that's shut. Whichever way
the number was arrived at is recorded, so the dispatcher sees "Calculated by the
app" or "Typed by the driver" next to it.

Routing uses Google Directions (with live traffic) when a Google Maps key is
configured, the free OSRM service when it isn't, and a distance-based estimate
if both are unreachable — so the driver always gets a number to work from rather
than an error.

---

## Getting it running

### 1. The backend

A Supabase project is already provisioned and wired up:

- URL: `https://vmsbetooodvyfiebyjmm.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/vmsbetooodvyfiebyjmm

**One setting you must change before the app will work.** New Supabase projects
require every user to confirm their email address, which blocks sign-up in a
mobile app that has no email flow. In the dashboard go to
**Authentication → Sign In / Providers → Email** and turn **Confirm email**
off. (Leave it on and switch to magic links later if you'd rather.)

To set this up on a different Supabase project instead, run
`supabase/migrations/0001_schema.sql` in that project's SQL editor and put its
URL and publishable key in `.env`.

### 2. The app

```bash
cd delivery-app
npm install
```

Background location is not available in Expo Go, so this needs a development
build rather than the Expo Go app:

```bash
npx expo run:android      # Android device or emulator
npx expo run:ios          # iPhone or simulator — needs a Mac and Xcode
```

After the first build, `npm start` is enough for day-to-day work.

### 3. First run

1. Sign up, choose **Dispatcher**, create your team. You get a six-character
   join code.
2. On the driver's phone, sign up, choose **Driver**, enter that code.
3. Create a job from the dispatcher's board and assign it. Watch it appear on
   the driver's phone.

---

## Configuration

`.env` holds three values:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=       # optional
```

The Supabase URL and publishable key are committed on purpose. Supabase
publishable keys are designed to ship inside client apps — the database is
protected by row level security, not by hiding the key, and any `EXPO_PUBLIC_`
value ends up in the app bundle regardless.

**The Google Maps key is optional but worth adding.** Without it:

- ETAs come from OSRM (real road routing, but no live traffic) instead of Google.
- The live map on **Android** renders blank, because Android's map view requires
  a Google key. iPhone is fine either way — it falls back to Apple Maps, which
  needs no key. The driver list below the map still works on both.

Get a key from the Google Cloud console with **Maps SDK for Android**, **Maps
SDK for iOS** and **Directions API** enabled, then rebuild.

---

## Who can see what

Every rule below is enforced by Postgres row level security, so a tampered or
rebuilt client gains nothing — the database refuses the query.

- A **dispatcher** sees every job and every driver's position on their own team.
- A **driver** sees only the jobs assigned to them, and can only report their
  own position.
- A driver cannot create jobs, promote themselves, move themselves between
  teams, or file a position under another driver's name.
- Someone outside the team sees nothing at all — not a job, not a position, not
  even the team's existence.
- **A join code puts someone on the team as a driver, never as a dispatcher**,
  whichever role they picked at sign-up. Otherwise anyone who got hold of the
  code could sign up as "Dispatcher", walk in, and see the whole operation.
  Promotion is a dispatcher's decision, made from the Team screen.
- A dispatcher can remove someone and rotate the join code, so an old code can't
  let a departed driver back in. Removing someone deletes their live position
  immediately.

### Verifying it yourself

The rules are covered by a test suite that builds a throwaway Postgres from the
schema file and checks 39 behaviours — the permitted ones and the denied ones,
plus the end-of-day totals (right jobs, right day, and one team's takings never
visible to another):

```bash
./supabase/tests/run.sh
```

It needs a local PostgreSQL 15+ (`initdb`, `pg_ctl`, `psql`) and nothing else —
no Supabase account, no network. Any `FAIL` row is a real regression.

---

## Location tracking, honestly

Tracking runs **only between "Start delivery" and "Complete delivery"**. It is
never on between jobs, and it stops on sign-out, on leaving the team, and when a
dispatcher removes the driver. The driver can see exactly what is being shared,
and stop it, from their Profile screen.

Both platforms need the "always"/"all the time" location permission for tracking
to survive the screen going off; the app asks for it at the right moment and
explains why. On Android a persistent notification shows while tracking is
active — that is required by the OS, and it is also the honest thing to show
someone whose location is being broadcast.

Positions are written two ways: `driver_locations` holds one row per driver
(the live pin, overwritten in place) and `location_pings` appends every reading,
so a run can be replayed afterwards.

---

## Layout

```
app/                        screens (expo-router; the file tree is the navigation)
  index.tsx                 decides where you land based on who you are
  sign-in / sign-up / onboarding
  boss/                     job board, new job, job detail, live map, end of day, team
  driver/                   run sheet, job detail, profile
src/
  lib/                      supabase client, generated DB types, formatting, geo maths
  providers/AuthProvider    session, profile and team, shared across the app
  hooks/                    realtime job, team, location and end-of-day queries
  services/
    tracking.ts             background GPS task and its permissions
    eta.ts                  geocoding and drive-time estimation
    navigation.ts           handing an address to Waze / Google / Apple Maps
  components/               shared UI, sized for use in a moving vehicle
supabase/
  migrations/0001_schema.sql   the whole database in one idempotent file
  tests/                       the security and end-of-day suites, and their runner
```

---

## Worth knowing before you ship

- **Push notifications aren't wired up.** A new job appears instantly while the
  app is open, but a driver with the app closed won't get a buzz. That needs an
  Expo push token per device and a small Supabase edge function on job insert —
  the natural next piece of work.
- **Bundle identifiers** are `com.twismdev.deliverytracker` on both platforms.
  Change them in `app.json` before submitting to either store.
- **App store review**: both stores scrutinise background location. Have the
  answer ready — an employer tracking employees during working hours, with
  visible in-app indicators and tracking limited to an active job — and expect
  to point at the Profile screen's disclosure.
