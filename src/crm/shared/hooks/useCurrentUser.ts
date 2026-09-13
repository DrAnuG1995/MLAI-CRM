import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canRead, canWrite, permsFromRows, type PermsMap } from "@/lib/permissions";
import type { AppModule, Profile, UserModulePermission } from "../types";

interface CurrentUser {
  userId: string | null;
  profile: Profile | null;
  perms: PermsMap;
  isAdmin: boolean;
  isActive: boolean;
  canRead: (module: AppModule) => boolean;
  canWrite: (module: AppModule) => boolean;
  isLoading: boolean;
  error: Error | null;
}

async function fetchProfileAndPerms() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const [{ data: profile, error: pErr }, { data: perms, error: mErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
    supabase.from("user_module_permissions").select("*").eq("user_id", session.user.id),
  ]);
  if (pErr) throw pErr;
  if (mErr) throw mErr;
  // Flip "Pending invite" → "Active" on the Team page. Best-effort.
  supabase.rpc("touch_last_seen").then(() => {}, () => {});
  return { profile: (profile as Profile) ?? null, perms: (perms as UserModulePermission[]) ?? [] };
}

export function useCurrentUser(): CurrentUser {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["current-user"], queryFn: fetchProfileAndPerms, staleTime: 60_000 });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return useMemo(() => {
    const profile = data?.profile ?? null;
    const perms = permsFromRows(data?.perms);
    const role = profile?.role;
    const active = profile?.is_active === true;
    return {
      userId: profile?.id ?? null,
      profile,
      perms,
      isAdmin: active && role === "admin",
      isActive: active,
      canRead: (m: AppModule) => active && canRead(perms, m, role),
      canWrite: (m: AppModule) => active && canWrite(perms, m, role),
      isLoading,
      error: (error as Error | null) ?? null,
    };
  }, [data, isLoading, error]);
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("is_active", true).order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });
}
