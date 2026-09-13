export type OrgKind = "sponsor" | "partner" | "venue" | "university" | "startup" | "enterprise" | "government" | "media" | "grant_body" | "accelerator" | "community";
export type OrgStage = "idea" | "pre_seed" | "seed" | "series_a_plus" | "bootstrapped" | "exited";
export type OrgTier = "gold" | "silver" | "bronze" | "community";
export type OrgStatus = "prospect" | "active" | "lapsed";
export type PersonType = "member" | "speaker" | "sponsor_contact" | "partner" | "volunteer" | "organiser" | "founder" | "mentor" | "investor";
export type PersonStatus = "active" | "inactive" | "unsubscribed";
export type DealKind = "sponsorship" | "partnership" | "venue" | "grant" | "speaker" | "studio";
export type EventKind = "meetup" | "workshop" | "hackathon" | "panel" | "social" | "conference";
export type EventStatus = "planned" | "published" | "done" | "cancelled";
export type Module = "people" | "organisations" | "deals" | "events";
/** Sidebar modules a user can be granted access to (matches public.app_modules). */
export type AppModule = "dashboard" | "people" | "organisations" | "pipeline" | "events" | "team";
export type UserRole = "admin" | "committee" | "volunteer" | "viewer";
export type ModuleAccess = "off" | "read" | "full";

export const ORG_KINDS: OrgKind[] = ["sponsor", "partner", "venue", "university", "startup", "accelerator", "community", "grant_body", "enterprise", "government", "media"];
export const ORG_STAGES: OrgStage[] = ["idea", "pre_seed", "seed", "series_a_plus", "bootstrapped", "exited"];
/** MLAI programmes (Linear projects) people take part in — offered as tags. */
export const PROGRAMMES = ["vibe-mentors", "vibe-raising", "vibe-market", "codex-monthly", "mlai-studio", "build-day", "esafety-hack", "partner-engine"];
export const ORG_TIERS: OrgTier[] = ["gold", "silver", "bronze", "community"];
export const ORG_STATUSES: OrgStatus[] = ["prospect", "active", "lapsed"];
export const PERSON_TYPES: PersonType[] = ["member", "founder", "mentor", "speaker", "investor", "sponsor_contact", "partner", "volunteer", "organiser"];
export const PERSON_STATUSES: PersonStatus[] = ["active", "inactive", "unsubscribed"];
export const DEAL_KINDS: DealKind[] = ["sponsorship", "partnership", "studio", "grant", "venue", "speaker"];
export const EVENT_KINDS: EventKind[] = ["meetup", "workshop", "hackathon", "panel", "social", "conference"];
export const EVENT_STATUSES: EventStatus[] = ["planned", "published", "done", "cancelled"];

/** Sponsor / partner / speaker contacts with no touch for this long show as due. */
export const FOLLOW_UP_DAYS = 30;

export const label = (s: string | null | undefined) =>
  (s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  deactivated_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface UserModulePermission {
  user_id: string;
  module: AppModule;
  access: ModuleAccess;
  updated_at: string;
}

export interface TeamAuditEntry {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  module: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Pick<Profile, "full_name" | "email"> | null;
  target?: Pick<Profile, "full_name" | "email"> | null;
}

export interface Organisation {
  id: string;
  name: string;
  kind: OrgKind;
  tier: OrgTier | null;
  status: OrgStatus;
  stage?: OrgStage | null;
  linear_url?: string | null;
  website: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  slack_handle: string | null;
  linkedin_url: string | null;
  role_title: string | null;
  organisation_id: string | null;
  type: PersonType;
  status: PersonStatus;
  tags: string[];
  notes: string | null;
  last_touch_at: string | null;
  location?: string | null;
  interests?: string[];
  offers?: string[];
  ai_level?: string | null;
  startup_status?: string | null;
  startup_name?: string | null;
  created_at: string;
  updated_at: string;
  organisation?: Pick<Organisation, "id" | "name"> | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
  is_closed: boolean;
  is_won: boolean;
}

export interface Deal {
  id: string;
  name: string;
  kind: DealKind;
  organisation_id: string | null;
  person_id: string | null;
  stage_id: string;
  position: number;
  value: number;
  owner_id: string | null;
  next_step: string | null;
  due_date: string | null;
  linear_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  organisation?: Pick<Organisation, "id" | "name"> | null;
  person?: Pick<Person, "id" | "full_name"> | null;
  owner?: Pick<Profile, "id" | "full_name" | "email"> | null;
  stage?: PipelineStage | null;
}

export interface Event {
  id: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  venue: string | null;
  venue_organisation_id: string | null;
  capacity: number | null;
  status: EventStatus;
  cost?: number | null;
  revenue?: number | null;
  rating?: number | null;
  linear_url?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventPerson {
  event_id: string;
  person_id: string;
  role: "attendee" | "speaker" | "volunteer";
  rsvp: "going" | "attended" | "no_show";
  created_at: string;
  person?: Pick<Person, "id" | "full_name" | "email" | "organisation_id"> & { organisation?: Pick<Organisation, "name"> | null };
}

export interface Activity {
  id: string;
  module: Module;
  entity_id: string | null;
  action: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  profile?: Pick<Profile, "full_name" | "email"> | null;
}
