# Kalendulu Market-Ready Setup

## Anbieter

- Auth: Supabase Auth
- Datenbank: Supabase Postgres mit Row Level Security
- KI-Backend: Cloudflare Worker
- KI-Modellwahl: OpenAI `gpt-5-nano`, `gpt-5-mini`, `gpt-5`

## Supabase

1. Oeffne Supabase SQL Editor.
2. Fuehre `supabase/migrations/20260605220000_market_ready_auth_and_state.sql` aus.
3. Aktiviere bei Bedarf Google/Apple OAuth in Supabase Auth.
4. Hinterlege die Redirect URLs aus Expo/Supabase fuer deine App.

Die Tabellen sind per RLS geschuetzt:

- `profiles`: nur der eigene Benutzer.
- `user_app_state`: nur eigene App-Zustaende pro `state_key`.

## Cloudflare Worker

Setze den OpenAI Secret:

```powershell
cd "C:\Users\rapha\Desktop\Kalendulu alt überarbeitet\Kalendulu\planner-worker"
npx.cmd wrangler secret put OPENAI_API_KEY
```

Deploy:

```powershell
npm.cmd run deploy
```

## Lokaler Start

Terminal 1:

```powershell
cd "C:\Users\rapha\Desktop\Kalendulu alt überarbeitet\Kalendulu\planner-worker"
npm.cmd run dev
```

Terminal 2:

```powershell
cd "C:\Users\rapha\Desktop\Kalendulu alt überarbeitet\Kalendulu"
npm.cmd start
```

## Sicherheit

- `EXPO_PUBLIC_DEV_AUTH_BYPASS=false` fuer normale Builds.
- Der Dev-Bypass funktioniert nur in Expo Go und nur im Development-Modus.
- KI-Requests brauchen ein gueltiges Supabase Bearer Token.
- Der OpenAI API-Key liegt nur im Cloudflare Worker Secret.
- Supabase RLS verhindert fremden Zugriff auf Profile und App-Zustaende.
