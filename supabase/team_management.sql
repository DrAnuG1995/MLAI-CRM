-- ================================================================
-- TEAM MANAGEMENT — run AFTER schema.sql, in the Supabase SQL editor.
-- ================================================================
-- Mirrors the StatDoctor CRM's model: roles + per-user-per-module
-- permissions, an authorize() function every RLS policy calls, invite
-- metadata → profile + seeded permissions, last-admin protection.
--
-- Read this before running: it REPLACES the open "any signed-in user can
-- do anything" policies from schema.sql. After it runs, a signed-in user
-- with no active profile sees nothing. The very first admin is created by
-- the statement at the bottom — edit the email there before you run it.
--
-- Dashboard prerequisites (Authentication):
--   • Providers → Email: keep "Allow new users to sign up" OFF (invites only)
--   • URL Configuration: Site URL = https://dranug1995.github.io/MLAI-CRM/
--     Redirect URLs: https://dranug1995.github.io/MLAI-CRM/**, http://localhost:8080/**
--   • SMTP: the built-in sender is rate-limited to a few emails an hour;
--     set custom SMTP (Resend etc.) before inviting the whole committee.
-- ================================================================

begin;

-- ── 1. profiles: roles, active flag, last seen ───────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
-- schema.sql used 'member'; map it onto the new role set before constraining
update public.profiles set role = 'committee' where role not in ('admin', 'committee', 'volunteer', 'viewer');
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'committee', 'volunteer', 'viewer'));
alter table public.profiles alter column role set default 'viewer';

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_profiles_email_lower on public.profiles (lower(email));

-- Keep profiles.email in step with auth.users.email
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users for each row execute function public.sync_profile_email();

-- ── 2. module registry ───────────────────────────────────────────────────
create table if not exists public.app_modules (
  module text primary key,
  label text not null,
  position int not null default 0,
  is_admin_only boolean not null default false
);
insert into public.app_modules (module, label, position, is_admin_only) values
  ('dashboard',     'Dashboard',     0, false),
  ('people',        'People',       10, false),
  ('organisations', 'Organisations',20, false),
  ('pipeline',      'Pipeline',     30, false),
  ('events',        'Events',       40, false),
  ('team',          'Team',        100, true)
on conflict (module) do update set label = excluded.label, position = excluded.position, is_admin_only = excluded.is_admin_only;

-- ── 3. per-user module permissions ───────────────────────────────────────
do $$ begin
  create type public.module_access as enum ('off', 'read', 'full');
exception when duplicate_object then null; end $$;

create table if not exists public.user_module_permissions (
  user_id uuid references public.profiles(id) on delete cascade not null,
  module text references public.app_modules(module) on update cascade on delete cascade not null,
  access public.module_access not null default 'off',
  updated_at timestamptz default now(),
  primary key (user_id, module)
);

-- ── 4. team audit log (append-only) ──────────────────────────────────────
create table if not exists public.team_audit_log (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  module text,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_team_audit_created on public.team_audit_log(created_at desc);

-- ── 5. helpers ───────────────────────────────────────────────────────────
-- Role presets. Keep src/lib/permissions.ts in sync.
create or replace function public.default_access_for_role(p_role text, p_module text)
returns public.module_access language sql immutable as $$
  select case
    when p_role = 'admin' then 'full'::public.module_access
    when p_role = 'committee' then
      case when p_module = 'team' then 'off'::public.module_access else 'full'::public.module_access end
    when p_role = 'volunteer' then
      case when p_module = 'events' then 'full'::public.module_access
           when p_module in ('dashboard', 'people', 'organisations') then 'read'::public.module_access
           else 'off'::public.module_access end
    when p_role = 'viewer' then
      case when p_module = 'team' then 'off'::public.module_access else 'read'::public.module_access end
    else 'off'::public.module_access
  end $$;

-- The one function every policy calls. Reads the profile directly (no JWT
-- hook needed), so a deactivation takes effect on the next request.
create or replace function public.authorize(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select p.role, p.is_active from public.profiles p where p.id = auth.uid()
  )
  select case
    when auth.uid() is null then false
    when not exists (select 1 from me) then false
    when not (select is_active from me) then false
    when (select role from me) = 'admin' then true
    else exists (
      select 1 from public.user_module_permissions ump
      where ump.user_id = auth.uid() and ump.module = p_module
        and ((p_action = 'read' and ump.access in ('read', 'full')) or (p_action = 'write' and ump.access = 'full'))
    )
  end $$;
revoke all on function public.authorize(text, text) from public;
grant execute on function public.authorize(text, text) to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;
grant execute on function public.is_admin() to authenticated;

-- Mark activity so "Pending invite" flips to "Active" on first sign-in.
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
grant execute on function public.touch_last_seen() to authenticated;

-- ── 6. new users: role from invite metadata, seed permissions ────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited_role text := coalesce(new.raw_user_meta_data->>'role', 'viewer');
begin
  if invited_role not in ('admin', 'committee', 'volunteer', 'viewer') then invited_role := 'viewer'; end if;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), invited_role, true)
  on conflict (id) do nothing;
  insert into public.user_module_permissions (user_id, module, access)
  select new.id, m.module, public.default_access_for_role(invited_role, m.module) from public.app_modules m
  on conflict (user_id, module) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill permissions for profiles that exist already
insert into public.user_module_permissions (user_id, module, access)
select p.id, m.module, public.default_access_for_role(p.role, m.module)
from public.profiles p cross join public.app_modules m
on conflict (user_id, module) do nothing;

-- ── 7. last-admin protection ─────────────────────────────────────────────
create or replace function public.protect_last_admin()
returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if (select count(*) from public.profiles where role = 'admin' and is_active and id <> old.id) = 0 then
      raise exception 'Cannot remove the last active admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update on public.profiles for each row execute function public.protect_last_admin();

-- ── 8. RLS rewrite ───────────────────────────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array['profiles', 'organisations', 'people', 'pipeline_stages', 'deals', 'events', 'event_people', 'event_sponsors', 'activity_feed'] loop
    execute format('drop policy if exists "committee read" on public.%I', t);
    execute format('drop policy if exists "committee write" on public.%I', t);
  end loop;
end $$;

-- profiles: everyone active can read the team list; only admins (via the
-- Edge Function's service role) change roles/active. Users may edit their own name.
create policy profiles_read on public.profiles for select to authenticated
  using (public.authorize('dashboard', 'read') or id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()) and is_active = (select is_active from public.profiles where id = auth.uid()));

create policy app_modules_read on public.app_modules for select to authenticated using (auth.uid() is not null);
alter table public.app_modules enable row level security;

alter table public.user_module_permissions enable row level security;
create policy ump_read on public.user_module_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

alter table public.team_audit_log enable row level security;
create policy team_audit_read on public.team_audit_log for select to authenticated using (public.is_admin());
revoke update, delete on public.team_audit_log from authenticated, anon;

-- module-gated data tables
create policy people_read  on public.people for select to authenticated using (public.authorize('people', 'read'));
create policy people_write on public.people for all    to authenticated using (public.authorize('people', 'write')) with check (public.authorize('people', 'write'));
create policy orgs_read    on public.organisations for select to authenticated using (public.authorize('organisations', 'read'));
create policy orgs_write   on public.organisations for all    to authenticated using (public.authorize('organisations', 'write')) with check (public.authorize('organisations', 'write'));
create policy stages_read  on public.pipeline_stages for select to authenticated using (public.authorize('pipeline', 'read') or public.authorize('dashboard', 'read'));
create policy stages_write on public.pipeline_stages for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy deals_read   on public.deals for select to authenticated using (public.authorize('pipeline', 'read'));
create policy deals_write  on public.deals for all    to authenticated using (public.authorize('pipeline', 'write')) with check (public.authorize('pipeline', 'write'));
create policy events_read  on public.events for select to authenticated using (public.authorize('events', 'read'));
create policy events_write on public.events for all    to authenticated using (public.authorize('events', 'write')) with check (public.authorize('events', 'write'));
create policy ep_read      on public.event_people for select to authenticated using (public.authorize('events', 'read'));
create policy ep_write     on public.event_people for all    to authenticated using (public.authorize('events', 'write')) with check (public.authorize('events', 'write'));
create policy es_read      on public.event_sponsors for select to authenticated using (public.authorize('events', 'read'));
create policy es_write     on public.event_sponsors for all    to authenticated using (public.authorize('events', 'write')) with check (public.authorize('events', 'write'));
-- activity: readable by anyone who can read the dashboard; writable by anyone
-- who can write the module the entry belongs to.
create policy activity_read  on public.activity_feed for select to authenticated using (public.authorize('dashboard', 'read'));
create policy activity_write on public.activity_feed for insert to authenticated
  with check (public.authorize(case module when 'deals' then 'pipeline' else module end, 'write'));

commit;

-- ── 9. FIRST ADMIN — edit the email, then run this once ──────────────────
-- update public.profiles set role = 'admin', is_active = true where email = 'you@example.com';
-- insert into public.user_module_permissions (user_id, module, access)
--   select id, m.module, 'full' from public.profiles, public.app_modules m where email = 'you@example.com'
--   on conflict (user_id, module) do update set access = 'full';
