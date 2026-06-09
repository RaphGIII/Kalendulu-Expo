create table if not exists public.study_v2_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  exam_date date,
  target_level text not null check (target_level in ('pass', 'good', 'excellent')),
  weekly_hours numeric not null default 8,
  minutes_per_learning_day integer not null default 90,
  tier_snapshot text not null check (tier_snapshot in ('free', 'premium', 'plus')),
  status text not null check (status in ('draft', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_v2_source_files (
  id uuid primary key,
  project_id uuid not null references public.study_v2_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('pdf', 'docx', 'pptx', 'txt', 'md')),
  file_size_bytes bigint not null default 0,
  extraction_status text not null check (extraction_status in ('pending', 'done', 'partial', 'failed')),
  extracted_text_length integer not null default 0,
  ocr_used boolean not null default false,
  warning text,
  created_at timestamptz not null default now()
);

create table if not exists public.study_v2_corpus_documents (
  id uuid primary key,
  project_id uuid not null references public.study_v2_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  title text not null,
  summary_markdown text not null,
  structured_summary_json jsonb not null,
  source_stats jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_v2_learning_units (
  id uuid primary key,
  project_id uuid not null references public.study_v2_projects(id) on delete cascade,
  corpus_document_id uuid not null references public.study_v2_corpus_documents(id) on delete cascade,
  heading text not null,
  bullets jsonb not null default '[]'::jsonb,
  difficulty integer not null default 3,
  importance integer not null default 3,
  estimated_minutes integer not null default 30,
  order_index integer not null default 0
);

create table if not exists public.study_v2_days (
  id uuid primary key,
  project_id uuid not null references public.study_v2_projects(id) on delete cascade,
  date date not null,
  day_index integer not null,
  title text not null,
  total_minutes integer not null default 0
);

create table if not exists public.study_v2_slots (
  id uuid primary key,
  project_id uuid not null references public.study_v2_projects(id) on delete cascade,
  day_id uuid not null references public.study_v2_days(id) on delete cascade,
  unit_ids jsonb not null default '[]'::jsonb,
  slot_type text not null check (slot_type in ('learn', 'review')),
  title text not null,
  bullets jsonb not null default '[]'::jsonb,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimated_minutes integer not null default 30,
  completed boolean not null default false
);

create table if not exists public.study_v2_processing_reports (
  id uuid primary key,
  project_id uuid references public.study_v2_projects(id) on delete cascade,
  corpus_document_id uuid references public.study_v2_corpus_documents(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'warning', 'error')),
  report_json jsonb not null,
  source_stats jsonb,
  cost_stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_v2_projects enable row level security;
alter table public.study_v2_source_files enable row level security;
alter table public.study_v2_corpus_documents enable row level security;
alter table public.study_v2_learning_units enable row level security;
alter table public.study_v2_days enable row level security;
alter table public.study_v2_slots enable row level security;
alter table public.study_v2_processing_reports enable row level security;

drop policy if exists "Users manage own study v2 projects" on public.study_v2_projects;
create policy "Users manage own study v2 projects" on public.study_v2_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own study v2 source files" on public.study_v2_source_files;
create policy "Users manage own study v2 source files" on public.study_v2_source_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own study v2 corpus" on public.study_v2_corpus_documents;
create policy "Users manage own study v2 corpus" on public.study_v2_corpus_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users read own study v2 units" on public.study_v2_learning_units;
create policy "Users read own study v2 units" on public.study_v2_learning_units
  for all using (project_id in (select id from public.study_v2_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.study_v2_projects where user_id = auth.uid()));
drop policy if exists "Users read own study v2 days" on public.study_v2_days;
create policy "Users read own study v2 days" on public.study_v2_days
  for all using (project_id in (select id from public.study_v2_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.study_v2_projects where user_id = auth.uid()));
drop policy if exists "Users read own study v2 slots" on public.study_v2_slots;
create policy "Users read own study v2 slots" on public.study_v2_slots
  for all using (project_id in (select id from public.study_v2_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.study_v2_projects where user_id = auth.uid()));
drop policy if exists "Users read own study v2 reports" on public.study_v2_processing_reports;
create policy "Users read own study v2 reports" on public.study_v2_processing_reports
  for all using (project_id in (select id from public.study_v2_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.study_v2_projects where user_id = auth.uid()));
