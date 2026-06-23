-- Release-readiness notes:
-- User-owned app data is stored either in user_app_state, profiles, study_v2_*
-- tables, api_cost_events, user_ai_credit_ledger, or in the study-temp storage
-- bucket. Policies below keep reads/writes scoped to auth.uid().

comment on table public.profiles is 'User-owned profile data. RLS restricts access to auth.uid() = id.';
comment on table public.user_app_state is 'User-owned JSON app state. RLS restricts access to auth.uid() = user_id.';
comment on table public.study_v2_projects is 'User-owned study project root. Child tables are scoped through project ownership.';
comment on table public.api_cost_events is 'Server-written cost audit rows. Users can only read their own rows.';
comment on table public.user_ai_credit_ledger is 'Server-written AI credit ledger. Users can only read their own rows.';

insert into storage.buckets (id, name, public)
values ('study-temp', 'study-temp', false)
on conflict (id) do update set public = false;

drop policy if exists "Users manage own study temp uploads" on storage.objects;
create policy "Users manage own study temp uploads"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'study-temp'
  and (storage.foldername(name))[1] = 'study-temp'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'study-temp'
  and (storage.foldername(name))[1] = 'study-temp'
  and (storage.foldername(name))[2] = auth.uid()::text
);
