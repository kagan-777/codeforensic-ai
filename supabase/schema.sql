-- ============================================================================
-- CODEFORENSIC AI — Supabase database schema
-- Run this whole file ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- It is safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- Automatically create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- projects --
create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 100),
  original_filename  text,
  file_count         integer not null default 0,
  languages          text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects (user_id);

-- ------------------------------------------------------------------- scans --
create table if not exists public.scans (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  previous_scan_id   uuid references public.scans (id) on delete set null,
  status             text not null default 'QUEUED'
                     check (status in ('QUEUED', 'SCANNING', 'COMPLETED', 'FAILED')),
  stage              text,
  original_filename  text,
  started_at         timestamptz,
  completed_at       timestamptz,
  files_scanned      integer not null default 0,
  findings_count     integer not null default 0,
  high_count         integer not null default 0,
  medium_count       integer not null default 0,
  low_count          integer not null default 0,
  skipped_count      integer not null default 0,
  truncated          boolean not null default false,
  error_message      text,
  created_at         timestamptz not null default now()
);
create index if not exists scans_user_id_idx on public.scans (user_id);
create index if not exists scans_project_id_idx on public.scans (project_id, created_at desc);

-- ---------------------------------------------------------------- findings --
create table if not exists public.findings (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid not null references public.scans (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_id             text not null,
  title               text not null,
  description         text not null,
  file_path           text not null,
  line_number         integer not null check (line_number >= 1),
  severity            text not null check (severity in ('HIGH', 'MEDIUM', 'LOW')),
  confidence          text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  evidence            text not null check (char_length(evidence) > 0),
  code_snippet        text not null,
  snippet_start_line  integer not null default 1,
  recommendation      text not null,
  language            text,
  fingerprint         text not null,
  ai_explanation      jsonb,
  ai_model            text,
  ai_generated_at     timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists findings_user_id_idx on public.findings (user_id);
create index if not exists findings_project_id_idx on public.findings (project_id);
create index if not exists findings_scan_id_idx on public.findings (scan_id);

-- ================================================================ SECURITY ==
-- Row Level Security: every row is visible ONLY to the user who owns it.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.scans    enable row level security;
alter table public.findings enable row level security;

-- profiles
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- projects
drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "projects: update own" on public.projects;
create policy "projects: update own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects: delete own" on public.projects;
create policy "projects: delete own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- scans (a scan can only be attached to a project you own)
drop policy if exists "scans: read own" on public.scans;
create policy "scans: read own" on public.scans
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scans: insert own" on public.scans;
create policy "scans: insert own" on public.scans
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "scans: update own" on public.scans;
create policy "scans: update own" on public.scans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- findings (a finding can only be attached to a scan you own, of the same project)
drop policy if exists "findings: read own" on public.findings;
create policy "findings: read own" on public.findings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "findings: insert own" on public.findings;
create policy "findings: insert own" on public.findings
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans s
      where s.id = scan_id and s.user_id = (select auth.uid()) and s.project_id = findings.project_id
    )
  );

drop policy if exists "findings: update own" on public.findings;
create policy "findings: update own" on public.findings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Findings are evidence produced by the scanner. Users may only update the
-- AI explanation columns — never the file, line, severity or evidence.
revoke update on public.findings from authenticated;
grant update (ai_explanation, ai_model, ai_generated_at) on public.findings to authenticated;

-- Scans: the scan owner can update progress/result columns, never ownership.
revoke update on public.scans from authenticated;
grant update (status, stage, started_at, completed_at, files_scanned, findings_count,
              high_count, medium_count, low_count, skipped_count, truncated, error_message)
  on public.scans to authenticated;

-- Anonymous (logged-out) visitors get nothing.
revoke all on public.profiles, public.projects, public.scans, public.findings from anon;
