# Kalendulu

Kalendulu is an Expo React Native app for goals, study planning, todos, habits, calendar planning, and AI-assisted learning plans. The first production target is iOS/App Store.

## Tech Stack

- Expo SDK 54
- React Native 0.81
- Expo Router
- Supabase Auth, database, storage, and Edge Functions
- Cloudflare Worker for AI planning, OCR, and study processing
- RevenueCat for Apple subscription purchases

## Local Setup

```bash
npm install
npx expo start --dev-client --clear
```

For iOS development builds:

```bash
eas build --platform ios --profile development
```

## Required Public Environment

Production builds require:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_PLANNER_API_URL`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`

Optional:

- `EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL`
- `EXPO_PUBLIC_AI_FREE_BLUEPRINTS_PER_MONTH`

See `docs/env.production.md`.

## Release Validation

```bash
npm run validate:publish
```

This runs lint, TypeScript, and Expo Doctor.

## iOS Release

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

## Server Deploys

Cloudflare Worker:

```bash
cd planner-worker
npm run deploy
```

Supabase Edge Function:

```bash
supabase functions deploy delete-account
```

## Documentation

- `docs/release-checklist.md`
- `docs/app-store-connect.md`
- `docs/env.production.md`
- `docs/auth.md`
- `docs/revenuecat.md`
- `docs/supabase-rls.md`
- `docs/delete-account.md`
- `docs/planner-worker.md`

Legal/support URLs are configured in `src/config/legalLinks.ts`.
