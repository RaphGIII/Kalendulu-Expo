# Auth And Deep Links

Production native scheme:

- `kalendulu://auth/callback`

Supabase redirect URLs to configure:

- `kalendulu://auth/callback`
- any Expo development callback URL used only during local testing

Current release posture:

- email/password Supabase auth is the stable release path
- Google/Apple OAuth helper code is isolated and not imported by login/register while disabled
- dev auth bypass is ignored in production

When OAuth is re-enabled:

- configure Supabase provider credentials
- test cancelled login flows
- test failed session extraction
- verify callbacks on a production TestFlight build, not only Expo Go
