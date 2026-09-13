-- ================================================================
-- Align CRM vocabulary with how MLAI works (from the Linear workspace).
-- Run after schema.sql. Additive only.
-- ================================================================
-- Organisations: partner communities / accelerators and grant bodies are
-- counterparties in Partner Engine and Grant Grinding; startups get a stage
-- (the Valley "100 startups" view lives in Linear — this is just the record).
alter table public.organisations drop constraint if exists organisations_kind_check;
alter table public.organisations add constraint organisations_kind_check
  check (kind in ('sponsor', 'partner', 'venue', 'university', 'startup', 'enterprise', 'government', 'media', 'grant_body', 'accelerator', 'community'));
alter table public.organisations
  add column if not exists stage text check (stage in ('idea', 'pre_seed', 'seed', 'series_a_plus', 'bootstrapped', 'exited')),
  add column if not exists linear_url text;

-- People: founders, mentors and investors are first-class in the programmes
alter table public.people drop constraint if exists people_type_check;
alter table public.people add constraint people_type_check
  check (type in ('member', 'speaker', 'sponsor_contact', 'partner', 'volunteer', 'organiser', 'founder', 'mentor', 'investor'));

-- Deals: Studio client work is a revenue line alongside sponsorship
alter table public.deals drop constraint if exists deals_kind_check;
alter table public.deals add constraint deals_kind_check
  check (kind in ('sponsorship', 'partnership', 'venue', 'grant', 'speaker', 'studio'));

-- Events: the two event OKRs (>=10% margin, fun rating > 4/5) need these
alter table public.events
  add column if not exists cost numeric(12,2),
  add column if not exists revenue numeric(12,2),
  add column if not exists rating numeric(3,2) check (rating is null or (rating >= 1 and rating <= 5)),
  add column if not exists linear_url text;
