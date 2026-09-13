-- ================================================================
-- MEMBER FORM — run after schema.sql (team_management.sql optional).
-- ================================================================
-- Public "tell us about yourself" form at <crm>/#/join. Anyone can submit
-- (anon insert only — they can never read anything back); the committee
-- reviews responses in the CRM and links each one to a person record.

create table if not exists public.member_submissions (
  id uuid default gen_random_uuid() primary key,
  source text not null default 'slack',               -- slack | substack | other
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  slack_handle text,
  answers jsonb not null default '{}'::jsonb,         -- everything else, keyed by question id
  matched_person_id uuid references public.people on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_submissions_email on public.member_submissions(lower(email));
create index if not exists idx_submissions_created on public.member_submissions(created_at desc);
create index if not exists idx_submissions_unreviewed on public.member_submissions(reviewed_at) where reviewed_at is null;

alter table public.member_submissions enable row level security;

drop policy if exists submissions_public_insert on public.member_submissions;
create policy submissions_public_insert on public.member_submissions
  for insert to anon, authenticated with check (true);

-- Committee: read/update if they can read/write People. Works with either
-- the open schema.sql policies or team_management.sql's authorize().
drop policy if exists submissions_read on public.member_submissions;
drop policy if exists submissions_update on public.member_submissions;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'authorize') then
    execute $p$create policy submissions_read on public.member_submissions for select to authenticated using (public.authorize('people', 'read'))$p$;
    execute $p$create policy submissions_update on public.member_submissions for update to authenticated using (public.authorize('people', 'write')) with check (public.authorize('people', 'write'))$p$;
  else
    execute $p$create policy submissions_read on public.member_submissions for select to authenticated using (true)$p$;
    execute $p$create policy submissions_update on public.member_submissions for update to authenticated using (true) with check (true)$p$;
  end if;
end $$;

-- A few extra fields the form collects onto the person record itself
alter table public.people
  add column if not exists location text,
  add column if not exists interests text[] default '{}',
  add column if not exists offers text[] default '{}',   -- mentor | volunteer | speaker | sponsor | venue | writer
  add column if not exists ai_level text,
  add column if not exists startup_status text,
  add column if not exists startup_name text;
