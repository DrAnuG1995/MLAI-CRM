# MLAI CRM

Committee CRM for the MLAI community — who we know, which sponsors owe us a
reply, and what's on next. Same structure and shell as the StatDoctor CRM
(`sd-crm`): Vite + React + TypeScript + Tailwind + shadcn/ui on Supabase, with
react-query for data and dnd-kit for the pipeline board.

## Modules

| Module | What it holds |
|---|---|
| **Dashboard** | People / orgs / open pipeline / won this year / upcoming events, follow-ups due, pipeline by stage, recent activity |
| **People** | Members, speakers, sponsor contacts, partners, volunteers, organisers — with Slack handle, tags, last touch, CSV export |
| **Organisations** | Sponsors (with tier), partners, venues, universities — people, deals and events sponsored per org |
| **Pipeline** | Kanban of sponsorship / partnership / venue / grant deals, drag between stages, value in AUD, owner, next step + due date, Linear issue link |
| **Events** | Meetups, workshops, hackathons — RSVPs / attendance tick-list, speakers, sponsors |
| **Team** | Invite committee members, roles, per-module access, deactivate, audit log |

Every record has an activity feed (note / email / meeting / Slack / call).
Logging against a person, ticking them off at an event, or adding them as a
speaker bumps `last_touch_at`; sponsor, partner and speaker contacts with no
touch for 30 days surface on the dashboard as **Needs a follow-up**.

The community itself lives in Slack and project work in Linear — this CRM
points at both (Slack handles on people, Linear URLs on deals) rather than
duplicating them.

## Running locally

```bash
npm install
cp .env.example .env   # fill in the Supabase URL + publishable key
npm run dev            # http://localhost:8080
```

## Backend (one-time)

1. Create a free project at supabase.com (its own project — not StatDoctor's,
   since every signed-in user of a project can read the whole CRM).
2. SQL editor → paste `supabase/schema.sql` → run. This creates the tables,
   seeds the six pipeline stages, and enables RLS for authenticated users.
3. Authentication → Users → **Add user** for each committee member (tick
   *Auto confirm*). No public sign-up.
4. Settings → API → copy the project URL and publishable key into `.env`.

## Team management (roles + per-module access)

Same model as the StatDoctor CRM: four roles (**admin**, **committee**,
**volunteer**, **viewer**) with a default access preset per module
(off / read / full) that admins can override per person from the Team page.
RLS calls `authorize(module, action)` on every query, so access is enforced
in the database, not just hidden in the UI.

Setup, after `schema.sql`:

1. Add your own user first (Authentication → Users → Add user, auto-confirm),
   then run `supabase/team_management.sql` in the SQL editor. Edit the email
   in the **FIRST ADMIN** block at the bottom and run that block too — until
   an admin exists nobody can invite anyone.
2. Deploy the Edge Function that performs invites and role changes (needs the
   CLI logged into an account with access to the project):

   ```bash
   supabase functions deploy team-admin --project-ref skxurdbeyixpydqmnkqm
   supabase secrets set FRONTEND_URL=https://dranug1995.github.io/MLAI-CRM --project-ref skxurdbeyixpydqmnkqm
   ```

3. Authentication → URL Configuration: Site URL
   `https://dranug1995.github.io/MLAI-CRM/`, redirect URLs
   `https://dranug1995.github.io/MLAI-CRM/**` and `http://localhost:8080/**`.
   Invite and reset links land on the site root and the app forwards to
   `#/onboarding` to set a password.
4. Authentication → SMTP: Supabase's built-in sender allows only a few
   emails an hour. Point it at Resend/Postmark before inviting everyone.

## Deploying

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub
Pages on every push to `main`. Set repo **variables** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, enable Pages (Source: GitHub Actions), and add
`public/CNAME` if serving from a custom domain. The Vite base is relative, so
the build works at a project-pages subpath and at a domain root; routing is
hash-based so deep links work on a static host.

Live: https://dranug1995.github.io/MLAI-CRM/

## Layout

```
src/
  App.tsx                 routes (HashRouter) + react-query + toaster
  crm/
    CrmLayout.tsx         navy sidebar shell, ⌘K search, signed-in footer
    AuthGuard.tsx         redirects to /login without a session
    auth/LoginPage.tsx
    dashboard/            DashboardPage
    people/               PeoplePage, PersonDetailPage, PersonDialog
    orgs/                 OrganisationsPage, OrganisationDetailPage, OrganisationDialog
    pipeline/             PipelinePage (kanban + deal sheet), DealDialog
    events/               EventsPage, EventDetailPage, EventDialog
    team/                 TeamPage
    shared/               types, logActivity, hooks, PageHeader / DataTable /
                          StatusBadge / EmptyState / ActivityFeed / GlobalSearch
  components/ui/          shadcn/ui primitives (copied from sd-crm)
  lib/                    supabase client, datetime (Melbourne), cn()
supabase/schema.sql       tables, seed stages, triggers, RLS
```
