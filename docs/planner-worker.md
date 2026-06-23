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

Hardening:

- unsupported methods return `405`
- oversized requests return `413`
- quota failures return structured JSON
- Study V2 persistence uses the user access token for user-owned rows
- API cost events are server-written

Deploy:

```bash
cd planner-worker
npm run deploy
```

Current quota enforcement still depends on the plan/tier supplied by the authenticated app request plus server-side usage ledgers. For strongest production enforcement, connect RevenueCat webhooks to Supabase and have the Worker read subscription state server-side.
