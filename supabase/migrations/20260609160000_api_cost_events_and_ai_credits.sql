create table if not exists public.api_cost_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  user_plan_snapshot text not null,
  subscription_status text,
  project_id uuid,
  project_title text,
  request_id text,
  feature text not null,
  stage text not null,
  provider text not null,
  api_key_alias text,
  provider_project_id text,
  provider_request_id text,
  model text,
  operation text not null,
  input_tokens integer default 0,
  output_tokens integer default 0,
  cached_input_tokens integer default 0,
  total_tokens integer default 0,
  pages_processed integer default 0,
  file_count integer default 0,
  total_file_bytes bigint default 0,
  unit_price_input_per_1m numeric,
  unit_price_output_per_1m numeric,
  unit_price_cached_input_per_1m numeric,
  unit_price_per_page numeric,
  computed_cost_usd numeric not null default 0,
  computed_cost_eur numeric not null default 0,
  provider_reported_cost_usd numeric,
  provider_reported_cost_eur numeric,
  billing_reconciled boolean not null default false,
  credit_used_usd numeric not null default 0,
  credit_used_eur numeric not null default 0,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_cost_events_user_month_idx on public.api_cost_events (user_id, created_at);
create index if not exists api_cost_events_project_idx on public.api_cost_events (project_id);
create index if not exists api_cost_events_feature_stage_idx on public.api_cost_events (feature, stage);

alter table public.api_cost_events enable row level security;

drop policy if exists "Users can read own api cost events" on public.api_cost_events;
create policy "Users can read own api cost events"
on public.api_cost_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users cannot insert api cost events" on public.api_cost_events;
create policy "Users cannot insert api cost events"
on public.api_cost_events
for insert
to authenticated
with check (false);

drop policy if exists "Users cannot update api cost events" on public.api_cost_events;
create policy "Users cannot update api cost events"
on public.api_cost_events
for update
to authenticated
using (false)
with check (false);

drop policy if exists "Users cannot delete api cost events" on public.api_cost_events;
create policy "Users cannot delete api cost events"
on public.api_cost_events
for delete
to authenticated
using (false);

create table if not exists public.user_ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null,
  amount_eur numeric not null default 0,
  amount_usd numeric not null default 0,
  remaining_eur numeric not null default 0,
  remaining_usd numeric not null default 0,
  revenuecat_product_id text,
  apple_transaction_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_ai_credit_ledger_user_idx on public.user_ai_credit_ledger (user_id, created_at);
alter table public.user_ai_credit_ledger enable row level security;

drop policy if exists "Users can read own ai credit ledger" on public.user_ai_credit_ledger;
create policy "Users can read own ai credit ledger"
on public.user_ai_credit_ledger
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users cannot mutate ai credit ledger" on public.user_ai_credit_ledger;
create policy "Users cannot mutate ai credit ledger"
on public.user_ai_credit_ledger
for all
to authenticated
using (false)
with check (false);

create or replace view public.admin_api_cost_overview as
select
  user_id,
  user_email,
  user_plan_snapshot,
  date_trunc('month', created_at)::date as month,
  sum(computed_cost_usd) as total_computed_cost_usd,
  sum(computed_cost_eur) as total_computed_cost_eur,
  sum(coalesce(provider_reported_cost_usd, 0)) as total_provider_reported_cost_usd,
  sum(credit_used_eur) as total_credit_used_eur,
  count(distinct project_id) filter (where feature = 'study_v2') as study_project_count,
  count(*) filter (where stage = 'ocr') as ocr_event_count,
  sum(pages_processed) as pages_processed,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(computed_cost_eur) filter (where stage = 'summary') as summary_cost_eur,
  sum(computed_cost_eur) filter (where stage = 'plan') as plan_cost_eur,
  sum(computed_cost_eur) filter (where stage = 'ocr') as ocr_cost_eur,
  case
    when count(distinct project_id) filter (where feature = 'study_v2') = 0 then 0
    else sum(computed_cost_eur) / count(distinct project_id) filter (where feature = 'study_v2')
  end as average_cost_per_project_eur,
  max(created_at) as last_event_at
from public.api_cost_events
group by user_id, user_email, user_plan_snapshot, date_trunc('month', created_at)::date;

create or replace view public.admin_api_cost_project_overview as
select
  user_id,
  user_email,
  user_plan_snapshot,
  project_id,
  project_title,
  sum(computed_cost_eur) as total_computed_cost_eur,
  sum(computed_cost_eur) filter (where stage = 'summary') as summary_cost_eur,
  sum(computed_cost_eur) filter (where stage = 'plan') as plan_cost_eur,
  sum(computed_cost_eur) filter (where stage = 'ocr') as ocr_cost_eur,
  sum(pages_processed) as pages_processed,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  count(*) as event_count,
  max(created_at) as last_event_at
from public.api_cost_events
group by user_id, user_email, user_plan_snapshot, project_id, project_title;

