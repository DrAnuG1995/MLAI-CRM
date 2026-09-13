import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PermsMap } from "@/lib/permissions";
import type { Profile, UserModulePermission, TeamAuditEntry } from "@/crm/shared/types";

export interface TeamMember extends Profile { perms: PermsMap }

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team", "members"],
    staleTime: 30_000,
    queryFn: async (): Promise<TeamMember[]> => {
      const [{ data: profiles, error: pErr }, { data: perms, error: mErr }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_module_permissions").select("*"),
      ]);
      if (pErr) throw pErr;
      if (mErr) throw mErr;
      const byUser = new Map<string, PermsMap>();
      for (const r of (perms ?? []) as UserModulePermission[]) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, {});
        byUser.get(r.user_id)![r.module] = r.access;
      }
      return ((profiles ?? []) as Profile[]).map((p) => ({ ...p, perms: byUser.get(p.id) ?? {} }));
    },
  });
}

export function useTeamAudit() {
  return useQuery({
    queryKey: ["team", "audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_audit_log")
        .select("*, actor:profiles!team_audit_log_actor_id_fkey(full_name, email), target:profiles!team_audit_log_target_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as TeamAuditEntry[];
    },
  });
}
