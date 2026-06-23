# Planner Worker

The Cloudflare Worker handles goal planning, study extraction, OCR, cost tracking, and Study V2 planning.

Required secrets/environment:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for server-side cost ledgers where needed
- `MISTRAL_API_KEY` if Mistral OCR is enabled

Public mobile apps must never receive provider secrets.

Authentication:

- Cost-generating routes require `Authorization: Bearer <Supabase access token>`.
- The Worker verifies the JWT against Supabase `/auth/v1/user`.
- Missing or invalid tokens return `401`.
- The Worker resolves billing server-side from `user_subscription_status`.
- Client-provided `tier`, `plan`, or `previewMode` values are never used as authoritative premium proof.

Hardening:

- unsupported methods return `405`
- oversized requests return `413`
- quota failures return structured JSON
- Study V2 persistence uses the user access token for user-owned rows
- API cost events are server-written

Server-side entitlement protected routes:

- `/study-v2/ingest`
- `/study-v2/summarize`
- `/study-v2/generate-plan`
- `/study/extractions`
- `/study/page-learning-extraction`
- `/study/ai/enhance`
- `/goal/refine`
- `/planner/suggest`
- `/api/ai/adaptive-goal/*`

CORS:

- Worker responses currently use `Access-Control-Allow-Origin: *` because the primary client is a native iOS app, not a browser origin with cookies.
- CORS is not used as a security boundary.
- Security depends on Supabase bearer-token authentication, server-side plan resolution, RLS, and quota checks.
- If a web client is introduced later, restrict CORS to the production web origins.

Deploy:

```bash
cd planner-worker
npm run deploy
```
