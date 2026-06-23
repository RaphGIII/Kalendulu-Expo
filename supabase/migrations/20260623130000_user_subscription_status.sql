create table if not exists public.user_subscription_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free_demo' check (plan in ('free_demo', 'starter', 'plus', 'premium_monthly', 'premium_yearly')),
  status text not null default 'inactive' check (status in ('active', 'trialing', 'inactive', 'expired', 'cancelled', 'billing_issue')),
  product_id text,
  entitlement_id text,
  current_period_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_subscription_status enable row level security;

revoke insert, update, delete on public.user_subscription_status from anon, authenticated;
grant select on public.user_subscription_status to authenticated;
grant all on public.user_subscription_status to service_role;

drop policy if exists "Users read own subscription status" on public.user_subscription_status;
create policy "Users read own subscription status"
on public.user_subscription_status
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users cannot insert subscription status" on public.user_subscription_status;
create policy "Users cannot insert subscription status"
on public.user_subscription_status
for insert
to authenticated
with check (false);

drop policy if exists "Users cannot update subscription status" on public.user_subscription_status;
create policy "Users cannot update subscription status"
on public.user_subscription_status
for update
to authenticated
using (false)
with check (false);

drop policy if exists "Users cannot delete subscription status" on public.user_subscription_status;
create policy "Users cannot delete subscription status"
on public.user_subscription_status
for delete
to authenticated
using (false);

comment on table public.user_subscription_status is 'Server-written subscription mirror. Clients may read their own status but cannot grant or mutate paid plans.';
comment on column public.user_subscription_status.plan is 'Authoritative server-side plan used by Worker quota enforcement.';
