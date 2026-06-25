# Production Environment

Kalendulu iOS release builds must not use fake or fallback public configuration.

Required EAS production environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL, must be `https://...`.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable/anon client key.
- `EXPO_PUBLIC_PLANNER_API_URL`: Cloudflare Worker base URL.
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`: RevenueCat iOS public SDK key, must start with `appl_`.
- `EXPO_PUBLIC_LEGAL_OPERATOR_NAME`: public operator name for privacy policy and imprint.
- `EXPO_PUBLIC_LEGAL_OPERATOR_ADDRESS`: public operator address for privacy policy and imprint.
- `EXPO_PUBLIC_LEGAL_OPERATOR_EMAIL`: public support/legal contact email.
- `EXPO_PUBLIC_LEGAL_OPERATOR_COUNTRY`: public operator country.

Optional public variables:

- `EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL`: only set if study extraction uses a different Worker URL.
- `EXPO_PUBLIC_AI_FREE_BLUEPRINTS_PER_MONTH`
- `EXPO_PUBLIC_LEGAL_LAST_UPDATED`: displayed legal text date, for example `24.06.2026`.

Development-only:

- `EXPO_PUBLIC_DEV_AUTH_BYPASS=true` works only in Expo Go and non-production runtime. It is ignored in release builds.

Server-side only, never in the mobile app:

- `OPENAI_API_KEY`
- `MISTRAL_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `SUPABASE_SERVICE_ROLE_KEY`

Validation is implemented in `src/config/env.ts`. In development, invalid values warn. In production, missing or malformed critical values throw before fake services are used.
