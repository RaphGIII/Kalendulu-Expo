# Supabase RLS Model

Kalendulu stores user-owned app data in:

- `profiles` with owner column `id`
- `user_app_state` with owner column `user_id`
- `study_v2_projects`, `study_v2_source_files`, `study_v2_corpus_documents` with owner column `user_id`
- study child tables scoped through `study_v2_projects.project_id`
- `api_cost_events` with owner column `user_id`
- `user_ai_credit_ledger` with owner column `user_id`
- private Storage bucket `study-temp`

RLS requirements:

- authenticated users can only read or mutate their own rows
- cost events and credit ledger are server-written; users can read their own rows but cannot insert/update/delete
- study child rows are allowed only when their parent project belongs to `auth.uid()`
- `study-temp` object paths are scoped to `study-temp/<user_id>/...`

Profile creation:

- `public.handle_new_user()` creates or updates `profiles` after auth user creation.
- The client also upserts profile data from Settings as a fallback.

Relevant migrations:

- `20260605220000_market_ready_auth_and_state.sql`
- `20260608090000_study_v2.sql`
- `20260609160000_api_cost_events_and_ai_credits.sql`
- `20260623120000_release_storage_rls_and_comments.sql`
