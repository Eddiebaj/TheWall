# RouteO

Ottawa/Gatineau transit and city companion app. Cross-border OC Transpo + STO support with real-time arrivals, ghost bus detection, reliability scoring, and trip planning.

## Tech Stack

- **Frontend**: React Native + Expo SDK 54, Expo Router v6
- **Backend**: 12 Vercel serverless functions (Node.js)
- **Database**: Supabase (PostgreSQL) — stops, GTFS static data, crowding reports, reliability metrics, community deals, push subscriptions
- **Routing**: OpenTripPlanner (self-hosted, OC Transpo + STO GTFS)
- **Real-time**: OC Transpo GTFS-RT (Azure API), STO GTFS-RT (protobuf)
- **Monitoring**: Sentry (crash reporting), UptimeRobot (endpoint health)

## Run Locally

```bash
npm install
npx expo start
```

Requires environment variables for OC Transpo API key, Supabase credentials, and Google Places API key. See `lib/supabase.ts` and the backend repo for configuration.

## Project Structure

```
app/
  (tabs)/          Tab screens: map, saved, planner, alerts, nearby, account, discover
  onboarding.tsx   5-screen first-run flow
  _layout.tsx      Root navigation + splash screen
components/        Extracted UI: NeighbourhoodSheet, ClassScheduleModal, TonightCard, etc.
lib/               Shared logic: campusData, neighbourhoodData, delayContext, storageKeys
context/           AppContext (theme, language, accessibility)
supabase/
  migrations/      SQL migration files for Supabase tables
```

## Data Sources

OC Transpo GTFS-RT, STO GTFS-RT, Open-Meteo weather, Ticketmaster, Eventbrite (via backend), NHL API, ESPN, VeloGo bike share, Ottawa ArcGIS (parks, road closures, garbage), Google Places, ReCollect (waste calendar), Nominatim geocoding.

## Backend

Separate repo. 12 serverless functions: arrivals, alerts, vehicles, news, places, plan, gas, events, route detail, community actions, crowding, cron refresh. GTFS data refreshed weekly via GitHub Actions.
