# Delivery Tracker

One app, two roles. A dispatcher raises deliveries and watches them happen; a
driver takes them, commits to an arrival time, and reports back at the door.
Runs on Android and iPhone from a single React Native codebase.

## What it does

**Dispatcher**

- Raise a delivery: address, number of products, cash to collect on delivery,
  plus optional customer name, phone and notes.
- Send it to a driver, or leave it unassigned and hand it out later.
- Watch every driver on a live map while they are on a run.
- Read the arrival time the driver committed to, and watch it move as they drive.
- Get the closing report: products actually delivered and cash actually
  collected, against what was ordered, with any shortfall spelled out.

**Driver**

- See jobs as they arrive, with the product count and the cash to collect.
- Accept or decline.
- Commit to an arrival time, either worked out from where you are or typed in.
- Open the address in Waze, Google Maps or Apple Maps.
- Start the trip, which shares your position with your dispatcher until you are
  done.
- Complete the delivery, confirming what you handed over and what you collected.

## How the arrival time works

This is worth being straight about, because it shapes the design.

**Waze cannot tell this app its ETA.** Neither can Google Maps or Apple Maps.
Deep links into a navigation app are one-way: you can send it a destination and
it will start guiding the driver, but there is no route back. No mobile platform
exposes a navigation app's live estimate to another app.

So the app works out its own estimate instead, and offers the driver two paths
to the same field:

| | Where the number comes from | When it is used |
|---|---|---|
| Work it out | The driver's GPS position and the delivery address, routed by the `route-eta` edge function | The default. One tap, and the figure is rounded up to the next five minutes so nobody quotes a customer "13 minutes". |
| Type it in | The driver picks a duration | When the driver knows something the router does not: a stop on the way, a loading queue, a road they know is shut. |

Either way the driver confirms before it is sent, and the dispatcher sees which
of the two it was.

Once the trip has started the estimate refreshes on its own every couple of
minutes from the driver's live position, so the dispatcher sees it slip or
improve without the driver touching the phone. A refresh is only written when
it moved by three minutes or more, otherwise every GPS tick would rewrite the
job and bury its timeline.

With a Google Maps server key configured the estimate accounts for current
traffic. Without one it falls back to the free OSRM router, which does not.
Both work; the app tells the driver which they are getting.

## How location tracking works

Tracking runs **only while a delivery is actually underway**. It starts when the
driver taps "Start trip" and stops the moment the job is completed, declined or
cancelled. It is not a staff tracker, and the permission prompts say exactly
that.

- Android runs it as a foreground service with a permanent notification, so it
  is always visible to the driver that the app is sharing their position.
- iOS uses the background location mode with the blue status indicator on.
- Positions are written to a local queue first, then uploaded. Out of signal in
  a car park or a rural stretch, the queue holds the trail and flushes it when
  the phone reconnects, so a dead spot fills in rather than being lost.
- A late upload of older fixes can never drag the live marker backwards.
- The driver can see what is queued, force a retry, and stop sharing at any
  time, from the "Me" tab.

## Architecture

```
delivery-tracker/
├── app/                       screens, routed by file path (expo-router)
│   ├── sign-in.tsx            email and password
│   ├── onboarding.tsx         create a team, or join one with a code
│   ├── (boss)/                dispatcher: job board, live map, team
│   └── (driver)/              driver: inbox, job flow, history, profile
├── src/
│   ├── api/                   every database and edge function call
│   ├── components/            shared UI
│   ├── hooks/                 realtime-backed data hooks
│   ├── lib/                   pure helpers, the Supabase client, tracking
│   └── state/session.tsx      who is signed in and what they may see
├── supabase/
│   ├── migrations/            schema, row level security, job state machine
│   ├── functions/             geocoding and routing, so the API key stays server-side
│   └── tests/                 database tests, run against a throwaway Postgres
└── tests/                     unit tests for the pure helpers
```

**Backend is Supabase**: Postgres for the data, its built-in auth for sign-in,
realtime for the live map and job board, and edge functions for anything that
needs an API key.

**Drivers never write to the jobs table directly.** Every state change goes
through a security-definer function (`accept_job`, `submit_eta`, `start_trip`,
`complete_job` and so on) that checks ownership and the legal transitions. A
tampered client cannot skip a step, complete someone else's delivery, or edit
the cash figure it was told to collect. Row level security keeps one team's work
invisible to another.

## Setting it up

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then apply the schema:

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy geocode route-eta
```

In **Authentication → Providers**, keep email enabled. For a small team, turning
off "Confirm email" makes sign-up a single step; leave it on if you would rather
verify addresses.

### 2. Mapping keys (optional, but recommended)

Everything works with no keys at all, using OpenStreetMap for address lookup and
OSRM for routing. Add a Google key when you want traffic-aware arrival times:

```bash
supabase secrets set GOOGLE_MAPS_SERVER_KEY=<key with Geocoding and Directions enabled>
```

That key lives on the server and is never shipped in the app. If you use the
keyless fallback in production, set an identifying user agent as well, which
OpenStreetMap's usage policy requires:

```bash
supabase secrets set NOMINATIM_USER_AGENT="your-company-name (you@example.com)"
```

Android additionally needs a Google Maps key to draw map tiles at all. iOS falls
back to Apple Maps, so a key there is optional.

### 3. The app

```bash
cd delivery-tracker
npm install
cp .env.example .env     # fill in your Supabase URL and anon key
```

### 4. Build and run

Background location and the map view are native code, so **Expo Go will not
run this app**. You need a development build:

```bash
npx expo run:android      # a connected device or emulator
npx expo run:ios          # macOS with Xcode
```

For builds you can hand to your drivers, use EAS:

```bash
npm install -g eas-cli
eas build --platform android --profile preview   # an installable .apk
eas build --platform ios --profile preview       # TestFlight
```

Publishing to the Play Store with background location requires a written
justification and a short video of the in-app disclosure. The wording in
`app.config.ts` is written to support that review, but read Google's current
background-location policy before you submit.

### 5. First run

1. The dispatcher signs up, picks "I dispatch the work", and names the team.
2. The Team tab shows a six-character code.
3. Each driver signs up, picks "I drive", and enters that code.
4. The dispatcher raises a delivery and sends it to a driver.

## Checks

```bash
npm run typecheck    # TypeScript, strict
npm run lint         # ESLint with the React Compiler rules
npm test             # unit tests for the ETA, geo, navigation and money helpers
npm run check        # all three

./supabase/tests/run.sh   # database tests: needs a local Postgres on $PGHOST
```

The database tests sign in as a dispatcher and two drivers with row level
security enforced, and assert the whole flow: onboarding, assignment, the job
state machine, the position pipeline, and that a driver cannot see another
team's work, promote themselves, or rewrite the cash figure.

## Things worth knowing before you rely on it

- **Email sign-up is open.** Anyone with the team code can join as a driver.
  That is fine for a small crew who trust each other; rotate the code from the
  Team tab if it leaks. For tighter control, invite-only sign-up would be the
  next step.
- **Cash figures are recorded, not reconciled.** The app shows the dispatcher
  where a delivery came up short. It does not run a float, a day sheet or a
  payout.
- **No push notifications yet.** A driver sees a new job when the app is open,
  because the job board is realtime. They will not get a phone alert while the
  app is closed. `expo-notifications` is already installed and the profile table
  has a `push_token` column, so this is a contained piece of work rather than a
  rewrite.
- **Breadcrumb history grows.** Every run stores its trail in `location_pings`.
  At a few drivers this is trivial, but add a retention policy before it becomes
  a year of history.
