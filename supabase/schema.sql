-- MLAI CRM schema. Run once in the Supabase SQL editor of a fresh project.
-- Mirrors the StatDoctor CRM's conventions: uuid ids, created_at/updated_at,
-- a seeded pipeline_stages table the kanban reads, per-entity activity
-- tables plus a cross-module activity_feed, and RLS that lets any signed-in
-- committee member read and write everything (accounts are created by hand
-- in Authentication -> Users; there is no public sign-up).

create extension if not exists pgcrypto;

-- ── profiles (one per auth user; used for "owner" and "logged by") ────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ── organisations (sponsors, partners, venues, universities) ─────────────
create table if not exists public.organisations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  kind text default 'sponsor' check (kind in ('sponsor', 'partner', 'venue', 'university', 'startup', 'enterprise', 'government', 'media')),
  tier text check (tier in ('gold', 'silver', 'bronze', 'community')),
  status text default 'prospect' check (status in ('prospect', 'active', 'lapsed')),
  website text,
  location text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── people (members, speakers, sponsor contacts, volunteers) ─────────────
create table if not exists public.people (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  email text,
  phone text,
  slack_handle text,
  linkedin_url text,
  role_title text,
  organisation_id uuid references public.organisations on delete set null,
  type text default 'member' check (type in ('member', 'speaker', 'sponsor_contact', 'partner', 'volunteer', 'organiser')),
  status text default 'active' check (status in ('active', 'inactive', 'unsubscribed')),
  tags text[] default '{}',
  notes text,
  last_touch_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── pipeline: sponsorships, partnerships, venues, grants ─────────────────
create table if not exists public.pipeline_stages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  position integer not null,
  color text default '#6B7280',
  is_closed boolean default false,
  is_won boolean default false
);

insert into public.pipeline_stages (name, position, color, is_closed, is_won)
select * from (values
  ('Lead',          0, '#6B7280', false, false),
  ('Contacted',     1, '#3B82F6', false, false),
  ('Proposal sent', 2, '#8B5CF6', false, false),
  ('Negotiating',   3, '#F59E0B', false, false),
  ('Won',           4, '#22C55E', true,  true),
  ('Lost',          5, '#EF4444', true,  false)
) as v(name, position, color, is_closed, is_won)
where not exists (select 1 from public.pipeline_stages);

create table if not exists public.deals (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  kind text default 'sponsorship' check (kind in ('sponsorship', 'partnership', 'venue', 'grant', 'speaker')),
  organisation_id uuid references public.organisations on delete set null,
  person_id uuid references public.people on delete set null,
  stage_id uuid references public.pipeline_stages not null,
  position integer default 0,
  value numeric(12,2) default 0,
  owner_id uuid references public.profiles,
  next_step text,
  due_date date,
  linear_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── events and attendance ────────────────────────────────────────────────
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  kind text default 'meetup' check (kind in ('meetup', 'workshop', 'hackathon', 'panel', 'social', 'conference')),
  starts_at timestamptz not null,
  venue text,
  venue_organisation_id uuid references public.organisations on delete set null,
  capacity integer,
  status text default 'planned' check (status in ('planned', 'published', 'done', 'cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.event_people (
  event_id uuid references public.events on delete cascade,
  person_id uuid references public.people on delete cascade,
  role text default 'attendee' check (role in ('attendee', 'speaker', 'volunteer')),
  rsvp text default 'going' check (rsvp in ('going', 'attended', 'no_show')),
  created_at timestamptz default now(),
  primary key (event_id, person_id, role)
);

create table if not exists public.event_sponsors (
  event_id uuid references public.events on delete cascade,
  organisation_id uuid references public.organisations on delete cascade,
  primary key (event_id, organisation_id)
);

-- ── activity ─────────────────────────────────────────────────────────────
create table if not exists public.activity_feed (
  id uuid default gen_random_uuid() primary key,
  module text not null check (module in ('people', 'organisations', 'deals', 'events')),
  entity_id uuid,
  action text not null,
  summary text,
  metadata jsonb default '{}',
  created_by uuid references public.profiles,
  created_at timestamptz default now()
);

create index if not exists idx_people_org on public.people(organisation_id);
create index if not exists idx_people_type on public.people(type);
create index if not exists idx_deals_stage on public.deals(stage_id);
create index if not exists idx_deals_org on public.deals(organisation_id);
create index if not exists idx_events_starts on public.events(starts_at);
create index if not exists idx_activity_entity on public.activity_feed(module, entity_id);
create index if not exists idx_activity_created on public.activity_feed(created_at desc);

-- ── updated_at maintenance ───────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['organisations', 'people', 'deals', 'events'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Logging any activity against a person counts as a touch.
create or replace function public.bump_last_touch()
returns trigger language plpgsql as $$
begin
  if new.module = 'people' and new.entity_id is not null then
    update public.people set last_touch_at = new.created_at where id = new.entity_id;
  end if;
  return new;
end $$;
drop trigger if exists activity_bump_touch on public.activity_feed;
create trigger activity_bump_touch after insert on public.activity_feed for each row execute function public.bump_last_touch();

-- ── RLS: any signed-in committee member can read and write everything ────
do $$ declare t text;
begin
  foreach t in array array['profiles', 'organisations', 'people', 'pipeline_stages', 'deals', 'events', 'event_people', 'event_sponsors', 'activity_feed'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "committee read" on public.%I', t);
    execute format('drop policy if exists "committee write" on public.%I', t);
    execute format('create policy "committee read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "committee write" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
