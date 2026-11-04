-- Core multi-user data. Apply only after creating the Supabase project.
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual', 'polar')),
  provider_activity_id text,
  title text not null,
  activity_type text not null default 'run',
  started_at timestamptz not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  distance_meters numeric(10,2) check (distance_meters is null or distance_meters >= 0),
  average_heart_rate integer check (average_heart_rate is null or average_heart_rate between 20 and 250),
  perceived_effort smallint check (perceived_effort is null or perceived_effort between 1 and 10),
  notes text not null default '',
  weather jsonb not null default '{}'::jsonb,
  imported_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, provider, provider_activity_id)
);

-- Keeps TCX-derived lap summaries, splits and sampled sensor traces when accounts are enabled.
alter table public.workouts add column if not exists imported_metrics jsonb not null default '{}'::jsonb;

create index if not exists workouts_owner_started_idx
  on public.workouts (owner_id, started_at desc);

create table if not exists public.daily_context (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  training_time time,
  location_label text,
  sleep_minutes integer check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  energy text check (energy is null or energy in ('very_low', 'low', 'normal', 'good', 'very_good')),
  carbohydrate_intake text check (carbohydrate_intake is null or carbohydrate_intake in ('low', 'usual', 'higher', 'carb_load')),
  carbohydrate_grams numeric(7,2) check (carbohydrate_grams is null or carbohydrate_grams between 0 and 2000),
  hydration_liters numeric(5,2) check (hydration_liters is null or hydration_liters between 0 and 50),
  weather_summary text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, day)
);

alter table public.daily_context add column if not exists carbohydrate_grams numeric(7,2) check (carbohydrate_grams is null or carbohydrate_grams between 0 and 2000);
alter table public.daily_context add column if not exists hydration_liters numeric(5,2) check (hydration_liters is null or hydration_liters between 0 and 50);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  race_date date not null,
  race_distance text not null check (race_distance in ('5k', '10k', 'half_marathon', 'marathon')),
  experience_level text not null,
  runs_per_week smallint not null check (runs_per_week between 1 and 7),
  current_weekly_km numeric(6,2) check (current_weekly_km is null or current_weekly_km >= 0),
  goal text not null default '',
  plan_data jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now()
);

create index if not exists training_plans_owner_idx
  on public.training_plans (owner_id, created_at desc);

create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  scheduled_date date not null,
  title text not null,
  session_type text not null,
  planned_distance_km numeric(6,2) check (planned_distance_km is null or planned_distance_km >= 0),
  instructions text not null default '',
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'rescheduled')),
  skip_reason text,
  completed_workout_id uuid references public.workouts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists plan_sessions_owner_date_idx
  on public.plan_sessions (owner_id, scheduled_date);

alter table public.workouts enable row level security;
alter table public.daily_context enable row level security;
alter table public.training_plans enable row level security;
alter table public.plan_sessions enable row level security;

create policy "workouts are private to their owner" on public.workouts
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "daily context is private to its owner" on public.daily_context
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "training plans are private to their owner" on public.training_plans
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "plan sessions are private to their owner" on public.plan_sessions
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
