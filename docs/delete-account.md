# Account Deletion

Apple requires apps with account creation to provide an in-app account deletion initiation flow.

Kalendulu implements this in Settings under the account section as `Account dauerhaft löschen`. The user must confirm twice. The client calls the Supabase Edge Function `delete-account` with the current Supabase access token.

The mobile app never contains `SUPABASE_SERVICE_ROLE_KEY`.

Server function responsibilities:

- verify the Supabase JWT with `auth.getUser()`
- determine the user server-side
- delete user-owned rows from `user_app_state`, `profiles`, `study_v2_projects`, `api_cost_events`, and `user_ai_credit_ledger`
- delete the server-side subscription mirror row in `user_subscription_status`
- attempt deletion from optional future app tables
- remove user-owned objects from the private `study-temp` bucket path
- delete the Supabase Auth user with admin privileges
- return structured JSON

Client responsibilities after success:

- clear local Kalendulu AsyncStorage keys
- sign out locally
- navigate back to login

Apple subscription warning:

- Account deletion does not cancel Apple billing.
- The in-app deletion confirmation warns users to cancel active Apple subscriptions via `Abo verwalten`.
- Immediate account deletion remains available.

Deploy:

```bash
supabase functions deploy delete-account
```

Required function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
