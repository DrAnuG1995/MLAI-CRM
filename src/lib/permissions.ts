import type { AppModule, ModuleAccess, UserRole } from "@/crm/shared/types";

export type PermsMap = Partial<Record<AppModule, ModuleAccess>>;

export const ALL_MODULES: AppModule[] = ["dashboard", "people", "organisations", "pipeline", "events", "team"];
export const ROLES: UserRole[] = ["admin", "committee", "volunteer", "viewer"];

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Dashboard",
  people: "People",
  organisations: "Organisations",
  pipeline: "Pipeline",
  events: "Events",
  team: "Team",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Everything, including inviting and removing team members",
  committee: "Full access to every module except Team",
  volunteer: "Runs events; read-only on people and organisations",
  viewer: "Read-only everywhere",
};

// Mirrors public.default_access_for_role() in supabase/team_management.sql.
// SQL is authoritative — keep these in sync.
export function defaultPermsForRole(role: UserRole): PermsMap {
  const all = (a: ModuleAccess): PermsMap => Object.fromEntries(ALL_MODULES.map((m) => [m, a])) as PermsMap;
  switch (role) {
    case "admin": return all("full");
    case "committee": return { ...all("full"), team: "off" };
    case "volunteer": return { ...all("off"), events: "full", dashboard: "read", people: "read", organisations: "read" };
    case "viewer": return { ...all("read"), team: "off" };
  }
}

export function canRead(perms: PermsMap, module: AppModule, role?: UserRole): boolean {
  if (role === "admin") return true;
  const a = perms[module];
  return a === "read" || a === "full";
}

export function canWrite(perms: PermsMap, module: AppModule, role?: UserRole): boolean {
  if (role === "admin") return true;
  return perms[module] === "full";
}

export function permsFromRows(rows: Array<{ module: AppModule; access: ModuleAccess }> | null | undefined): PermsMap {
  const out: PermsMap = {};
  for (const r of rows ?? []) out[r.module] = r.access;
  return out;
}
