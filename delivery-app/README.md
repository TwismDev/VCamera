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
| 1b | **Driver** | Can also raise a job themselves — a walk-up, or a customer who called them directly. It lands on the dispatcher's board marked **Driver added**, already accepted, and is tracked exactly like any other job. |
| 2 | Dispatcher | Assigns it to a driver. It appears on that driver's phone right away over the realtime feed, and a **push notification** buzzes them even if the app is closed. Cancelling a job pushes too, so nobody drives to a drop that is off. |
| 3 | Driver | **Accepts** or declines. Accepting stamps the time server-side. |
| 4 | Driver | Taps **Calculate drive time** for an automatic ETA, adjusts the number if they know better, and sends it. Waze, Google Maps and the built-in maps app all open the address for actual navigation. |
| 5 | Driver | Taps **Start delivery**. Their position streams to the dispatcher every ~15 seconds (or every 30 m), in the background, with the screen off. |
| 6 | Dispatcher | Watches the live map: every driver, every active drop, distance remaining, speed, phone battery, and how long ago each position arrived. |
| 7 | Driver | Taps **Complete delivery**, confirms products delivered and cash collected (both pre-filled with what was sent out, editable if the drop came up short), adds a note. |
| 8 | Dispatcher | Sees it land as completed, with delivered-vs-sent and collected-vs-due side by side, and a warning banner if either came back short. Location sharing stops the moment the job closes. |
| 8b | Dispatcher or driver | **Replay this run** draws the GPS trail that was recorded on the way: start, drop, distance, time on the road, and a play button that walks the pin along the route. Tracking still only ran between Start and Complete — this is just looking at what was already stored. |
| 9 | Dispatcher | At knock-off, the **End of day sheet** totals the day's takings: cash collected, cash due, the difference, a per-driver breakdown of who is holding what, and every delivery with its customer name and time. Any earlier day can be pulled up with the arrows, and the whole thing copies out as plain text for a handover message. |

### About the ETA

You asked whether the app should work the ETA out itself or have the driver type
it — it does both, because neither alone is right. The app calculates a real
drive time from the driver's current position to the delivery address and
pre-fills it; the driver can then adjust it before sending, because they know
about the loading bay, the coffee stop, and the road that's shut. Whichever way
the number was arrived at is recorded, so the dispatcher sees "Calculated by the
app" or "Typed by the driver" next to it.

**The ETA keeps itself current.** Sending one number at the kerb is close to
useless twenty minutes into a jam, so while a driver is en route the app
recomputes the drive time from their live position every couple of minutes and
updates the dispatcher — no taps, works with the screen off, riding on the GPS
stream that is already running. If the driver typed their own number, it stands
until they ask for a fresh calculation; they know things the routing engine
doesn't. The dispatcher sees a live "arriving in" countdown, and a warning if
an automatic ETA stops refreshing, which means the driver's phone has lost
signal rather than that traffic is steady.

Routing falls down a ladder, best first:

| Provider | Live traffic | Needs |
| --- | --- | --- |
| **Google Routes API** (`TRAFFIC_AWARE_OPTIMAL`) | Yes | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Google Directions (legacy) | Yes | An older key where Routes isn't enabled |
| Mapbox `driving-traffic` | Yes | `EXPO_PUBLIC_MAPBOX_TOKEN` |
| OSRM | No — real roads, no conditions | Nothing |
| Straight-line estimate | No | Nothing |

Each rung falls through to the next on failure, so the driver always gets a
number to work from rather than an error, and the app says which rung it used
(and how much of the estimate is traffic) instead of implying false precision.

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

**The Google Maps key is optional but the single biggest accuracy win.**
Without it:

- ETAs lose live traffic, falling to Mapbox if you set a token, then to OSRM —
  real road routing, but blind to conditions.
- The live map on **Android** renders blank, because Android's map view requires
  a Google key. iPhone is fine either way — it falls back to Apple Maps, which
  needs no key. The driver list below the map still works on both.

Get a key from the Google Cloud console with **Routes API**, **Maps SDK for
Android** and **Maps SDK for iOS** enabled, then rebuild. Note it is the
*Routes* API, not the older Directions API — Google made Directions legacy, and
new Cloud projects can no longer enable it. The app still speaks Directions as a
fallback for keys that predate the change.

---

## Who can see what

Every rule below is enforced by Postgres row level security, so a tampered or
rebuilt client gains nothing — the database refuses the query.

- A **dispatcher** sees every job and every driver's position on their own team.
- A **driver** sees only the jobs assigned to them, and can only report their
  own position.
- A driver **can** raise a job for themselves, but never for a colleague:
  handing work to someone else stays a dispatcher's call. A driver-raised job
  cannot masquerade as dispatcher-issued.
- On a job the dispatcher sent out, a driver may report what happened — status,
  ETA, products delivered, cash collected, notes — but cannot rewrite the brief.
  The address, item count and cash due are pinned, so a driver cannot quietly
  lower `cash_to_collect` to match a short drop before the end-of-day sheet
  totals it. On their own jobs they own the details and can correct them.
- A driver cannot promote themselves, move themselves between teams, hand a job
  to a colleague, or file a position under another driver's name.
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
schema file and checks 83 behaviours — the permitted ones and the denied ones,
the end-of-day totals (right jobs, right day, and one team's takings never
visible to another), push dispatch (the right events fire, the wrong ones
stay silent, and the webhook secret is out of reach of any signed-in user),
and the GPS trail (a driver files their own crumbs, a dispatcher can replay
them after the job completes, a teammate cannot watch a colleague's run):

```bash
npm run test:db     # 83 database checks: schema, RLS, push dispatch, driver jobs, replay
npm run test:eta    # 22 checks on the ETA provider ladder, against stubbed HTTP
npm run test:geo    # 9 checks on path distance used by route replay
```

The database suite needs a local PostgreSQL 15+ (`initdb`, `pg_ctl`, `psql`)
and nothing else — no Supabase account, no network. The ETA suite needs neither,
and deliberately never calls a routing service: those cost money per request,
so it asserts what actually goes wrong in practice — which provider is chosen,
what is sent, how each response shape is read, and that a failure downgrades a
rung rather than throwing. Any `FAIL` row is a real regression.

---

## Push notifications

A driver's phone registers an Expo push token against their profile. A trigger
on `jobs` hands the job id to the `notify-driver` edge function, which looks up
the driver's devices and sends through Expo. Two things buzz a driver: a job
being assigned to them, and a job they hold being cancelled. A dispatcher is
buzzed when a driver raises a job of their own. Accepting, sending an ETA and
completing deliberately stay silent — nobody should be notified about their own
taps.

The database never talks to Expo, and the phone never holds a server
credential. The function's endpoint is public (Postgres has no user session to
present), so it is guarded by a 256-bit shared secret kept in a `private`
schema that PostgREST does not expose. The function proves it knows the secret
via `verify_push_secret` rather than reading it, so the secret never leaves the
database.

Expo replies per device, and tokens it reports as `DeviceNotRegistered` — an
uninstalled or reset handset — are pruned automatically.

### Turning it on

Push is already deployed and enabled on the provisioned project. Two things are
needed for a token to actually be issued on a phone:

1. **An EAS project id.** Expo mints push tokens per project. Run `npx eas-cli
   init` in `delivery-app/`, which writes `extra.eas.projectId` into `app.json`,
   then rebuild. Without it the app runs fine and simply reports push as
   unavailable on the driver's Profile screen.
2. **A real device.** Simulators cannot receive push.

On a different Supabase project, also deploy the function and point the
database at it:

```bash
supabase functions deploy notify-driver --no-verify-jwt
```

```sql
update private.push_config
   set functions_url = 'https://<project-ref>.supabase.co/functions/v1/notify-driver',
       enabled = true;
```

Until `enabled` is true, push is inert and everything else works unchanged.

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
(the live pin, overwritten in place) and `location_pings` appends every reading.
**Replay this run** on a job that has been started draws that trail on a map
and can play it back. A driver only ever sees their own crumbs; a dispatcher
sees the team's. Completing the job does not delete the trail — that is the
point of keeping it.

---

## Layout

```
app/                        screens (expo-router; the file tree is the navigation)
  index.tsx                 decides where you land based on who you are
  sign-in / sign-up / onboarding
  boss/                     job board, new job, job detail, live map, end of day, team
  driver/                   run sheet, add a job, job detail, profile
  replay/[id]               GPS trail for one job, with play-back
src/
  lib/                      supabase client, generated DB types, formatting, geo maths
  providers/AuthProvider    session, profile and team, shared across the app
  hooks/                    realtime job, team, location, ping and end-of-day queries
  services/
    tracking.ts             background GPS task and its permissions
    eta.ts                  geocoding and drive-time estimation
    navigation.ts           handing an address to Waze / Google / Apple Maps
    push.ts                 push token registration and notification payloads
  components/               shared UI, sized for use in a moving vehicle
supabase/
  migrations/0001_schema.sql   the whole database in one idempotent file
  functions/notify-driver/     the edge function that sends the pushes
  tests/                       the security and end-of-day suites, and their runner
```

---

## Worth knowing before you ship

- **Bundle identifiers** are `com.twismdev.deliverytracker` on both platforms.
  Change them in `app.json` before submitting to either store.
- **App store review**: both stores scrutinise background location. Have the
  answer ready — an employer tracking employees during working hours, with
  visible in-app indicators and tracking limited to an active job — and expect
  to point at the Profile screen's disclosure.
